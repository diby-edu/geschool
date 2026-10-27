import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { isStaffFunction } from '@/lib/permissions/roles';
import { notifyUsers } from './notifications';
import { sendAndLog } from './sms-log';

/**
 * Les messages de la plateforme aux écoles (lot 5, 0148, décidé le 2026-10-26).
 *
 * Un message part vers des écoles et, dans chacune, vers les personnes
 * cochées. Livraison par la cloche (une notification par personne) ; en
 * option, un SMS au fondateur, payé par la plateforme. L'appelant a vérifié
 * qu'il est Super Admin.
 */

export const AUDIENCES = ['DIRECTION', 'STAFF', 'TEACHERS', 'GUARDIANS'] as const;
export type MessageAudience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  DIRECTION: 'La direction',
  STAFF: 'Tout le personnel',
  TEACHERS: 'Les enseignants',
  GUARDIANS: 'Les parents',
};

/** Fondateur, directeur, adjoint, censeur : ceux qui décident dans l'école. */
const DIRECTION = new Set(['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR']);

function wanted(codes: string[], audience: MessageAudience[]): boolean {
  return audience.some((a) =>
    a === 'DIRECTION'
      ? codes.some((c) => DIRECTION.has(c))
      : a === 'STAFF'
        ? codes.some((c) => c === 'SCHOOL_ADMIN' || isStaffFunction(c))
        : a === 'TEACHERS'
          ? codes.includes('TEACHER')
          : codes.includes('GUARDIAN'),
  );
}

/** Les personnes visées dans une école (appartenances actives, toutes lues : plus de 1 000 parents). */
export async function recipientsOf(schoolId: string, audience: MessageAudience[]): Promise<string[]> {
  const admin = createAdminClient('notifications.send');
  type Row = { id: string; user_id: string; membership_roles: { roles: { code: string } | null }[] };
  const rows = await fetchAllRows<Row>((cursor) => {
    let q = admin
      .from('school_memberships')
      .select('id, user_id, membership_roles(roles(code))')
      .eq('school_id', schoolId)
      .eq('status', 'ACTIVE')
      .order('id')
      .limit(1000);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  });
  const ids = new Set<string>();
  for (const m of rows) {
    const codes = m.membership_roles.map((r) => r.roles?.code).filter((c): c is string => !!c);
    if (wanted(codes, audience)) ids.add(m.user_id);
  }
  return [...ids];
}

/** Le numéro du fondateur : son numéro de connexion, sa fiche, sinon celui de l'école. */
export async function founderPhone(schoolId: string): Promise<string | null> {
  const admin = createAdminClient('notifications.send');
  const { data: founders } = await admin
    .from('membership_roles')
    .select('school_memberships!inner(user_id, school_id, status), roles!inner(code)')
    .eq('school_memberships.school_id', schoolId)
    .eq('school_memberships.status', 'ACTIVE')
    .eq('roles.code', 'SCHOOL_ADMIN')
    .limit(5);
  const userIds = ((founders ?? []) as unknown as { school_memberships: { user_id: string } }[]).map((f) => f.school_memberships.user_id);
  if (userIds.length > 0) {
    const [{ data: acc }, { data: users }, { data: profiles }] = await Promise.all([
      admin.from('account_access').select('login_identifier').eq('school_id', schoolId).in('user_id', userIds),
      admin.from('users').select('phone_e164').in('id', userIds),
      admin.from('staff_profiles').select('phone2_e164').eq('school_id', schoolId).in('user_id', userIds),
    ]);
    const phone =
      ((acc ?? []) as { login_identifier: string }[]).find((a) => a.login_identifier.startsWith('+'))?.login_identifier ??
      ((users ?? []) as { phone_e164: string | null }[]).find((u) => u.phone_e164)?.phone_e164 ??
      ((profiles ?? []) as { phone2_e164: string | null }[]).find((p) => p.phone2_e164)?.phone2_e164;
    if (phone) return phone;
  }
  const { data: school } = await admin.from('schools').select('phone_e164').eq('id', schoolId).maybeSingle();
  return school?.phone_e164 ?? null;
}

export type MessageDraft = {
  title: string;
  body: string;
  importance: 'INFO' | 'IMPORTANT';
  showUntil: string | null;
  target: 'ALL' | 'TRIALING' | 'PAID' | 'EXPIRED' | 'SCHOOLS';
  schoolIds: string[];
  audience: MessageAudience[];
  smsToFounder: boolean;
};

/** Envoie : notifications dans chaque école, SMS en option ; renvoie l'identifiant du message. */
export async function sendPlatformMessage(
  actorId: string,
  draft: MessageDraft,
  schools: { id: string; name: string }[],
  sms: { sender: string; pricePerSms: number },
): Promise<{ id: string; recipients: number; smsSent: number }> {
  const admin = createAdminClient('notifications.send');
  const { data: msg, error } = await admin
    .from('platform_messages' as never)
    .insert({
      title: draft.title,
      body: draft.body,
      importance: draft.importance,
      show_until: draft.showUntil,
      target: draft.target,
      school_ids: schools.map((s) => s.id),
      audience: draft.audience,
      sms_to_founder: draft.smsToFounder,
      schools_count: schools.length,
      created_by: actorId,
    } as never)
    .select('id')
    .single();
  if (error || !msg) throw new Error('Le message n’a pas pu être enregistré.');
  const id = (msg as { id: string }).id;

  let recipients = 0;
  let smsSent = 0;
  for (const s of schools) {
    const ids = await recipientsOf(s.id, draft.audience);
    recipients += await notifyUsers(s.id, ids, {
      type: 'platform.message',
      title: draft.title,
      body: draft.body,
      entityType: 'platform_message',
      entityId: id,
      data: { importance: draft.importance, showUntil: draft.showUntil, from: 'platform' },
    });
    if (draft.smsToFounder) {
      const to = await founderPhone(s.id);
      if (to) {
        // Au nom de la plateforme (école vide) : payé par elle, hors du quota de l'école.
        const r = await sendAndLog({
          schoolId: null,
          to,
          body: `${draft.title}. ${draft.body}`.slice(0, 300),
          sender: sms.sender,
          kind: 'PLATFORM',
          createdBy: actorId,
          pricePerSms: sms.pricePerSms,
        });
        if (r.ok) smsSent++;
      }
    }
  }
  await admin
    .from('platform_messages' as never)
    .update({ recipients_count: recipients, sms_sent: smsSent } as never)
    .eq('id', id);
  return { id, recipients, smsSent };
}
