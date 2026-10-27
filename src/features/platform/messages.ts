import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { ValidationError } from '@/lib/errors';
import { AUDIENCES, type MessageAudience, type MessageDraft } from '@/services/platform-messages';
import { requireAdmin, listSchoolsForAdmin } from './admin';

/**
 * Les messages de la plateforme, côté Super Admin (lot 5, maquette
 * docs/maquettes/super-admin-messages.html) : lecture du formulaire, écoles
 * visées, messages envoyés et lectures.
 */

export const TARGET_LABEL: Record<MessageDraft['target'], string> = {
  ALL: 'Toutes les écoles',
  TRIALING: 'Les écoles en essai',
  PAID: 'Les écoles abonnées',
  EXPIRED: 'Les écoles à l’abonnement expiré',
  SCHOOLS: 'Des écoles au choix',
};

/** Le formulaire, vérifié. */
export function parseDraft(fd: FormData): MessageDraft {
  const title = String(fd.get('title') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  if (!title) throw new ValidationError('Écrivez un titre.');
  if (title.length > 140) throw new ValidationError('Le titre est trop long (140 caractères au plus).');
  if (body.length > 2000) throw new ValidationError('Le texte est trop long (2 000 caractères au plus).');
  const target = String(fd.get('target') ?? 'ALL') as MessageDraft['target'];
  if (!(target in TARGET_LABEL)) throw new ValidationError('Choisissez les écoles.');
  const schoolIds = fd.getAll('schoolIds').map(String).filter(Boolean);
  if (target === 'SCHOOLS' && schoolIds.length === 0) throw new ValidationError('Cochez au moins une école.');
  const audience = fd
    .getAll('audience')
    .map(String)
    .filter((a): a is MessageAudience => (AUDIENCES as readonly string[]).includes(a));
  if (audience.length === 0) throw new ValidationError('Cochez qui reçoit le message dans l’école.');
  const showUntil = String(fd.get('showUntil') ?? '').trim() || null;
  if (showUntil && !/^\d{4}-\d{2}-\d{2}$/.test(showUntil)) throw new ValidationError('Date d’affichage invalide.');
  return {
    title,
    body,
    importance: fd.get('importance') === 'IMPORTANT' ? 'IMPORTANT' : 'INFO',
    showUntil,
    target,
    schoolIds,
    audience,
    smsToFounder: fd.get('sms') === 'on',
  };
}

/** Les écoles visées (jamais une école archivée). */
export async function targetSchools(draft: Pick<MessageDraft, 'target' | 'schoolIds'>): Promise<{ id: string; name: string }[]> {
  const all = (await listSchoolsForAdmin()).filter((s) => s.status !== 'ARCHIVED');
  const status = (s: (typeof all)[number]) => s.subscription?.status ?? null;
  const picked =
    draft.target === 'ALL'
      ? all
      : draft.target === 'TRIALING'
        ? all.filter((s) => status(s) === 'TRIALING')
        : draft.target === 'PAID'
          ? all.filter((s) => status(s) === 'ACTIVE')
          : draft.target === 'EXPIRED'
            ? all.filter((s) => status(s) === 'PAST_DUE')
            : all.filter((s) => draft.schoolIds.includes(s.id));
  return picked.map((s) => ({ id: s.id, name: s.name }));
}

export type SentMessage = {
  id: string;
  title: string;
  body: string;
  importance: 'INFO' | 'IMPORTANT';
  showUntil: string | null;
  target: MessageDraft['target'];
  audience: MessageAudience[];
  smsToFounder: boolean;
  schoolsCount: number;
  recipients: number;
  smsSent: number;
  read: number;
  createdAt: string;
};

type Row = {
  id: string;
  title: string;
  body: string;
  importance: 'INFO' | 'IMPORTANT';
  show_until: string | null;
  target: MessageDraft['target'];
  audience: MessageAudience[];
  sms_to_founder: boolean;
  schools_count: number;
  recipients_count: number;
  sms_sent: number;
  created_at: string;
};

async function readCount(id: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('entity_id', id).not('read_at', 'is', null);
  return count ?? 0;
}

function toSent(r: Row, read: number): SentMessage {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    importance: r.importance,
    showUntil: r.show_until,
    target: r.target,
    audience: r.audience,
    smsToFounder: r.sms_to_founder,
    schoolsCount: r.schools_count,
    recipients: r.recipients_count,
    smsSent: r.sms_sent,
    read,
    createdAt: r.created_at,
  };
}

export async function listSentMessages(limit = 50): Promise<SentMessage[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_messages' as never)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const reads = await Promise.all(rows.map((r) => readCount(r.id)));
  return rows.map((r, i) => toSent(r, reads[i]!));
}

/** Un message et, école par école, combien l'ont lu. */
export async function getSentMessage(
  id: string,
): Promise<{ message: SentMessage; schools: { id: string; name: string; recipients: number; read: number }[] } | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from('platform_messages' as never).select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  const r = data as unknown as Row;
  type N = { id: string; school_id: string; read_at: string | null };
  const notes = await fetchAllRows<N>((cursor) => {
    let q = supabase.from('notifications').select('id, school_id, read_at').eq('entity_id', id).order('id').limit(1000);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: N[] | null; error: { message: string } | null }>;
  });
  const bySchool = new Map<string, { recipients: number; read: number }>();
  for (const n of notes) {
    const s = bySchool.get(n.school_id) ?? { recipients: 0, read: 0 };
    s.recipients++;
    if (n.read_at) s.read++;
    bySchool.set(n.school_id, s);
  }
  const ids = [...bySchool.keys()];
  const { data: schools } = ids.length ? await supabase.from('schools').select('id, name').in('id', ids) : { data: [] };
  const names = new Map(((schools ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return {
    message: toSent(r, notes.filter((n) => n.read_at).length),
    schools: [...bySchool]
      .map(([sid, s]) => ({ id: sid, name: names.get(sid) ?? '—', ...s }))
      .sort((a, b) => a.read / Math.max(1, a.recipients) - b.read / Math.max(1, b.recipients)),
  };
}
