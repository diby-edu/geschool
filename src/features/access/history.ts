import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';

/**
 * L'historique des accès : qui a reçu ses identifiants, quand, et ce qui est
 * arrivé à son compte depuis.
 *
 * Le droit `access_accounts.view_history` existait depuis le début sans
 * qu'aucun écran ne le commande. Or c'est la première question posée quand un
 * enseignant dit « je n'ai jamais reçu mes codes » : on doit pouvoir répondre
 * autrement que de mémoire.
 */

export const ACCESS_EVENT_LABELS: Record<string, string> = {
  ACCOUNT_CREATED: 'Compte créé',
  ACCOUNT_ACTIVATED: 'Compte activé',
  ACCOUNT_SUSPENDED: 'Compte suspendu',
  ACCOUNT_REACTIVATED: 'Compte réactivé',
  CREDENTIALS_SENT: 'Identifiants envoyés',
  CREDENTIALS_RESENT: 'Identifiants renvoyés',
  PASSWORD_RESET: 'Mot de passe réinitialisé',
  PASSWORD_CHANGED: 'Mot de passe changé',
  LOGIN_FAILED: 'Échec de connexion',
  LOGIN_LOCKED: 'Compte bloqué après plusieurs échecs',
};

export type AccessEventRow = {
  id: string;
  at: string;
  type: string;
  label: string;
  /** La personne concernée. */
  person: string;
  /** Qui a agi — vide quand c'est la personne elle-même ou le système. */
  actor: string | null;
  detail: string | null;
};

export async function listAccessHistory(
  ctx: TenantContext,
  opts: { userId?: string; limit?: number } = {},
): Promise<AccessEventRow[]> {
  const supabase = await createClient();
  const limit = opts.limit ?? 200;

  type Row = {
    id: string;
    created_at: string;
    event_type: string;
    metadata: Record<string, unknown> | null;
    user_id: string | null;
    actor_id: string | null;
  };

  const rows = await fetchAllRows<Row>((cursor) => {
    let q = supabase
      .from('access_events')
      .select('id, created_at, event_type, metadata, user_id, actor_id')
      .eq('school_id', ctx.school.id)
      .order('id')
      .limit(limit);
    if (opts.userId) q = q.eq('user_id', opts.userId);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  }, limit);

  // Les noms en une seule lecture : un historique de deux cents lignes ne doit
  // pas déclencher quatre cents requêtes.
  const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.actor_id]).filter((v): v is string => !!v))];
  const noms = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from('users').select('id, display_name').in('id', ids);
    for (const u of (data ?? []) as { id: string; display_name: string | null }[]) {
      noms.set(u.id, u.display_name ?? '—');
    }
  }

  return rows
    .map((r) => ({
      id: r.id,
      at: r.created_at,
      type: r.event_type,
      label: ACCESS_EVENT_LABELS[r.event_type] ?? r.event_type,
      person: (r.user_id && noms.get(r.user_id)) || '—',
      actor: r.actor_id && r.actor_id !== r.user_id ? (noms.get(r.actor_id) ?? null) : null,
      detail: detail(r.metadata),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Ce que les métadonnées disent d'utile, en une phrase. */
function detail(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const morceaux: string[] = [];
  const canal = typeof meta.channel === 'string' ? meta.channel : null;
  if (canal) morceaux.push(canal === 'SMS' ? 'par SMS' : canal.toLowerCase());
  const raison = typeof meta.reason === 'string' ? meta.reason : null;
  if (raison) morceaux.push(raison);
  return morceaux.length > 0 ? morceaux.join(' · ') : null;
}
