import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { STAFF_FUNCTIONS } from '@/lib/permissions/roles';
import type { TablesInsert } from '@/types/database';
import type { Audience } from '@/features/communication/audience';

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

/**
 * Résout les destinataires d'une audience.
 *
 * Quatre critères, qui s'additionnent : tout l'établissement, des fonctions,
 * des classes, des niveaux. Viser une classe atteint les PERSONNES qui lui sont
 * rattachées — les parents de ses élèves, les élèves qui ont un compte, et les
 * enseignants qui y interviennent.
 *
 * Quand une fonction ET une classe sont cochées, on croise : « les parents des
 * 6ᵉ » ne doit pas écrire à tous les parents de l'école.
 */
export async function resolveAudienceUserIds(schoolId: string, audience: Audience): Promise<string[]> {
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
  const parRole = new Set<string>();
  for (const m of rows) {
    if (audience.all) parRole.add(m.user_id);
    const codes = m.membership_roles.map((mr) => mr.roles?.code).filter((c): c is string => !!c);
    // « Personnel administratif » (code SCHOOL_ADMIN) vise TOUTES les fonctions du
    // personnel : directeur, censeur, secrétaire, informaticien…, pas seulement le fondateur.
    const isStaff = codes.some((c) => c === 'SCHOOL_ADMIN' || (STAFF_FUNCTIONS as readonly string[]).includes(c));
    if (codes.some((c) => wantRoles.has(c)) || (wantRoles.has('SCHOOL_ADMIN') && isStaff)) parRole.add(m.user_id);
  }
  if (audience.all) return [...parRole];

  const classIds = await resolveClassIds(admin, schoolId, audience);
  if (classIds.length === 0) return [...parRole];

  const parClasse = await usersOfClasses(admin, schoolId, classIds);
  // Une fonction cochée AVEC une classe restreint : « les parents des 6ᵉ ».
  // Sans fonction, la classe seule atteint tout le monde autour d'elle.
  if (wantRoles.size === 0) return [...parClasse];
  return [...parClasse].filter((id) => parRole.has(id));
}

/** Les classes visées, en dépliant les niveaux. */
async function resolveClassIds(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  audience: Audience,
): Promise<string[]> {
  const ids = new Set(audience.classIds ?? []);
  const levels = audience.levelIds ?? [];
  if (levels.length > 0) {
    const { data } = await admin.from('classes').select('id').eq('school_id', schoolId).in('level_id', levels);
    for (const c of (data ?? []) as { id: string }[]) ids.add(c.id);
  }
  return [...ids];
}

/**
 * Les comptes rattachés à des classes : parents des élèves inscrits, élèves
 * eux-mêmes s'ils ont un compte, et enseignants qui y interviennent.
 */
async function usersOfClasses(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  classIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();

  const { data: inscrits } = await admin
    .from('student_enrollments')
    .select('student_id')
    .eq('school_id', schoolId)
    .in('class_id', classIds)
    .eq('status', 'ENROLLED');
  const studentIds = [...new Set((inscrits ?? []).map((e) => (e as { student_id: string }).student_id))];

  if (studentIds.length > 0) {
    const { data: eleves } = await admin
      .from('students')
      .select('user_id')
      .eq('school_id', schoolId)
      .in('id', studentIds)
      .not('user_id', 'is', null);
    for (const e of (eleves ?? []) as { user_id: string | null }[]) if (e.user_id) ids.add(e.user_id);

    const { data: liens } = await admin
      .from('student_guardians')
      .select('guardians(user_id)')
      .eq('school_id', schoolId)
      .in('student_id', studentIds);
    for (const l of (liens ?? []) as unknown as { guardians: { user_id: string | null } | null }[]) {
      if (l.guardians?.user_id) ids.add(l.guardians.user_id);
    }
  }

  const { data: profs } = await admin
    .from('teaching_assignments')
    .select('teachers(user_id)')
    .eq('school_id', schoolId)
    .in('class_id', classIds);
  for (const t of (profs ?? []) as unknown as { teachers: { user_id: string | null } | null }[]) {
    if (t.teachers?.user_id) ids.add(t.teachers.user_id);
  }

  return ids;
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
