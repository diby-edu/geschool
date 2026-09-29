import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import { MODULE_LABELS } from './labels';
import { personName } from '@/lib/person-name';

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  module: string;
  /** Nom de la personne ; null si elle n'est pas lisible par l'utilisateur ou si l'événement est système. */
  actor: string | null;
  actorRole: string | null;
  platformAdmin: boolean;
  after: unknown;
};

/** Domaines proposés au filtre : ceux que l'écran sait nommer. Une valeur hors liste est ignorée. */
export const AUDIT_MODULES = Object.keys(MODULE_LABELS);

/**
 * Une page du journal, du plus récent au plus ancien. Tri sur (date, id) : deux
 * événements écrits dans la même milliseconde ne changent pas de page d'un appel
 * à l'autre. Lecture sous RLS (`audit.view`, appliqué aussi par la base).
 */
export async function listAudit(
  ctx: TenantContext,
  module: string | undefined,
  page: Pick<ListParams, 'from' | 'to'>,
): Promise<{ rows: AuditRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('audit_logs')
    .select(
      'id, created_at, action, module, actor_role, actor_is_platform_admin, after, ' +
        'users!audit_logs_actor_user_id_fkey(first_name, last_name, display_name)',
      { count: 'exact' },
    )
    .eq('school_id', ctx.school.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page.from, page.to);
  if (module && AUDIT_MODULES.includes(module)) query = query.eq('module', module);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as {
    id: string;
    created_at: string;
    action: string;
    module: string;
    actor_role: string | null;
    actor_is_platform_admin: boolean;
    after: unknown;
    users: { first_name: string; last_name: string; display_name: string | null } | null;
  }[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    module: r.module,
    actor: r.users ? personName(r.users, '') || null : null,
    actorRole: r.actor_role,
    platformAdmin: r.actor_is_platform_admin,
    after: r.after,
  }));
  return { rows, total: count ?? 0 };
}
