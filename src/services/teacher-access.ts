import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TenantContext } from '@/lib/tenant/context';
import { findOrCreatePhoneAccess } from './access-provisioning';

/**
 * Acces de connexion d'un enseignant : le directeur clique « Creer l'acces »
 * sur sa fiche. Le telephone de la fiche devient l'identifiant. Si ce numero a
 * deja un acces dans l'ecole (l'enseignant est aussi parent), on lui AJOUTE le
 * role Enseignant : meme compte, meme mot de passe, aucun nouveau SMS.
 *
 * Comme pour les parents, un compte neuf laisse son envoi d'identifiants EN
 * ATTENTE : le directeur l'envoie depuis « Gestion des acces » (a l'unite ou en
 * groupe). Un seul endroit pour transmettre les identifiants, quel que soit le
 * role.
 */

export type TeacherAccessOutcome =
  | { outcome: 'CREATED' }
  | { outcome: 'LINKED'; existingKind: string; activated: boolean }
  | { outcome: 'ALREADY' };

export async function createTeacherAccess(ctx: TenantContext, teacherId: string): Promise<TeacherAccessOutcome> {
  requireWritable(ctx, 'access_accounts.create');
  const admin = createAdminClient('auth.create_user');

  const { data: teacher } = await admin
    .from('teachers')
    .select('id, first_name, last_name, phone_e164, user_id')
    .eq('school_id', ctx.school.id)
    .eq('id', teacherId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!teacher) throw new NotFoundError();
  if (teacher.user_id) return { outcome: 'ALREADY' };
  if (!teacher.phone_e164) {
    throw new ValidationError(`Renseignez d'abord le téléphone de ${teacher.first_name} ${teacher.last_name} sur sa fiche.`);
  }

  const access = await findOrCreatePhoneAccess(ctx, {
    phone: teacher.phone_e164,
    firstName: teacher.first_name,
    lastName: teacher.last_name,
    role: 'TEACHER',
    subjectKind: 'TEACHER',
  });

  const { error: linkError } = await admin.from('teachers').update({ user_id: access.userId }).eq('id', teacher.id);
  if (linkError) {
    if (linkError.code === '23505') throw new ConflictError('Ce compte est déjà relie a une autre fiche enseignant.');
    throw linkError;
  }

  await audit(ctx, {
    action: 'teachers.create_access',
    module: 'access',
    entityType: 'teacher',
    entityId: teacher.id,
    after: { userId: access.userId, created: access.created, existingKind: access.existingKind },
  });

  if (!access.created) {
    return { outcome: 'LINKED', existingKind: access.existingKind ?? 'inconnu', activated: access.existingActivated };
  }

  return { outcome: 'CREATED' };
}

/** Cree les acces de tous les enseignants qui n'en ont pas et qui ont un telephone (50 par passage). */
export async function createMissingTeacherAccesses(
  ctx: TenantContext,
): Promise<{ created: number; linked: number; noPhone: number; failed: number; remaining: number }> {
  requireWritable(ctx, 'access_accounts.create');
  const admin = createAdminClient('auth.create_user');

  const { data: pending } = await admin
    .from('teachers')
    .select('id, phone_e164')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null)
    .is('user_id', null)
    .eq('status', 'ACTIVE')
    .order('last_name');

  const all = pending ?? [];
  const withPhone = all.filter((t) => t.phone_e164);
  const batch = withPhone.slice(0, 50);
  const result = { created: 0, linked: 0, noPhone: all.length - withPhone.length, failed: 0, remaining: withPhone.length - batch.length };

  for (const t of batch) {
    try {
      const r = await createTeacherAccess(ctx, t.id);
      if (r.outcome === 'CREATED') result.created++;
      else if (r.outcome === 'LINKED') result.linked++;
    } catch (error) {
      console.error('[teacher-access] échec', t.id, error);
      result.failed++;
    }
  }
  return result;
}
