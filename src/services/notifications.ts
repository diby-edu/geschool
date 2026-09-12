import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { TablesInsert } from '@/types/database';

/**
 * Écriture des notifications (table `notifications`).
 *
 * Sa policy d'insertion est réservée au platform admin : une notification que
 * son destinataire pourrait fabriquer ne vaudrait rien (RLS 0025). C'est donc
 * cette couche service, en service_role, qui les crée — après que l'appelant a
 * vérifié le droit de publier/notifier.
 */

export type NotificationInput = {
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
};

/** Résout les destinataires d'une audience (codes de rôle, ou tout le monde). */
export async function resolveAudienceUserIds(schoolId: string, audience: { all?: boolean; roles?: string[] }): Promise<string[]> {
  const admin = createAdminClient('notifications.send');

  const { data } = await admin
    .from('school_memberships')
    .select('user_id, membership_roles(roles(code))')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE');
  const rows = (data ?? []) as unknown as {
    user_id: string;
    membership_roles: { roles: { code: string } | null }[];
  }[];

  const wantRoles = new Set((audience.roles ?? []).map((r) => r.toUpperCase()));
  const ids = new Set<string>();
  for (const m of rows) {
    if (audience.all) {
      ids.add(m.user_id);
      continue;
    }
    const codes = m.membership_roles.map((mr) => mr.roles?.code).filter((c): c is string => !!c);
    if (codes.some((c) => wantRoles.has(c))) ids.add(m.user_id);
  }
  return [...ids];
}

/** Crée une notification pour chaque destinataire (insertion groupée). */
export async function notifyUsers(schoolId: string, userIds: string[], input: NotificationInput): Promise<number> {
  if (userIds.length === 0) return 0;
  const admin = createAdminClient('notifications.send');
  const rows: TablesInsert<'notifications'>[] = userIds.map((uid) => ({
    school_id: schoolId,
    user_id: uid,
    type: input.type,
    title: input.title,
    body: input.body,
    ...(input.entityType ? { entity_type: input.entityType } : {}),
    ...(input.entityId ? { entity_id: input.entityId } : {}),
    data: (input.data ?? {}) as Record<string, never>,
  }));
  // Insertion par lots pour ne pas dépasser les limites de requête sur un gros
  // effectif (mono-vCPU, ADR-014).
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error, count } = await admin.from('notifications').insert(rows.slice(i, i + CHUNK), { count: 'exact' });
    if (error) throw error;
    inserted += count ?? 0;
  }
  return inserted;
}
