import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { normalizePhone } from '@/lib/auth/identifier';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { attachGuardian } from '@/services/enrollment';
import { assertGuardianPhoneFree, moveGuardianLogin } from '@/services/guardian-access';
import type { GuardianEditInput, StudentIdentityInput } from './edit-schemas';

/**
 * Corriger le dossier d'un élève et ses responsables légaux, après l'inscription.
 *
 * Écritures sous l'identité de la personne (RLS) : la base exige elle-même
 * « Modifier le dossier d'un élève » (students.update) et les droits sur les
 * responsables (guardians.update / create / delete). Seul l'accès de connexion
 * d'un parent (son téléphone) passe par le client d'administration, une fois
 * la modification du responsable acceptée par la base.
 *
 * Chaque correction est inscrite au journal, avec l'avant et l'après.
 */

type Db = Awaited<ReturnType<typeof createClient>>;

const STUDENT_COLUMNS = 'id, matricule, first_name, last_name, gender, birth_date, birth_place, is_state_assigned';

export async function updateStudentIdentity(ctx: TenantContext, studentId: string, input: StudentIdentityInput): Promise<void> {
  requireWritable(ctx, 'students.update');
  const supabase = await createClient();
  const { data: before } = await supabase.from('students').select(STUDENT_COLUMNS).eq('school_id', ctx.school.id).eq('id', studentId).maybeSingle();
  if (!before) throw new NotFoundError('Élève introuvable.');

  const matricule = input.matricule ? input.matricule.toUpperCase().replace(/\s+/g, '') : before.matricule;
  const after = {
    matricule,
    first_name: input.firstName,
    last_name: input.lastName,
    gender: input.gender,
    birth_date: input.birthDate,
    birth_place: input.birthPlace,
    is_state_assigned: input.isStateAssigned === '1',
  };
  const { data, error } = await supabase
    .from('students')
    .update(after)
    .eq('school_id', ctx.school.id)
    .eq('id', studentId)
    .select('id');
  if (error) {
    if (error.code === '23505') throw new ConflictError(`Le matricule ${matricule} est déjà utilisé par un autre élève.`);
    throw error;
  }
  if (!data?.length) throw new NotFoundError('Élève introuvable, ou droit « Modifier le dossier d’un élève » manquant.');

  await audit(ctx, { action: 'students.update', module: 'students', entityType: 'student', entityId: studentId, before, after });
}

/** Le lien élève ↔ responsable, avec le responsable lui-même. */
async function loadLink(supabase: Db, ctx: TenantContext, studentId: string, guardianId: string) {
  const { data } = await supabase
    .from('student_guardians')
    .select('relationship, is_primary_contact, guardians(id, user_id, first_name, last_name, phone_e164)')
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('guardian_id', guardianId)
    .maybeSingle();
  const link = data as unknown as {
    relationship: string;
    is_primary_contact: boolean;
    guardians: { id: string; user_id: string | null; first_name: string; last_name: string; phone_e164: string } | null;
  } | null;
  if (!link?.guardians) throw new NotFoundError('Ce responsable n’est pas rattaché à cet élève.');
  return link as typeof link & { guardians: NonNullable<typeof link.guardians> };
}

/** Un seul contact principal par élève. */
async function makePrimary(supabase: Db, ctx: TenantContext, studentId: string, guardianId: string) {
  const { error } = await supabase
    .from('student_guardians')
    .update({ is_primary_contact: false })
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .neq('guardian_id', guardianId);
  if (error) throw error;
}

export async function updateGuardian(ctx: TenantContext, studentId: string, guardianId: string, input: GuardianEditInput): Promise<void> {
  requireWritable(ctx, 'guardians.update');
  const supabase = await createClient();
  const link = await loadLink(supabase, ctx, studentId, guardianId);
  const g = link.guardians;

  const phone = normalizePhone(input.phone, ctx.school.countryCode);
  if (!phone) throw new ValidationError('Téléphone invalide.');
  const phoneChanged = phone !== g.phone_e164;

  // Le téléphone est l'identifiant de connexion du parent : il doit rester unique dans l'école.
  if (phoneChanged) await assertGuardianPhoneFree(ctx, { id: g.id, userId: g.user_id }, phone);

  const { data: updated, error } = await supabase
    .from('guardians')
    .update({ first_name: input.firstName, last_name: input.lastName, phone_e164: phone, ...(phoneChanged ? { phone_display: null } : {}) })
    .eq('school_id', ctx.school.id)
    .eq('id', g.id)
    .select('id');
  if (error) {
    if (error.code === '23505') throw new ConflictError('Ce numéro est déjà celui d’un autre responsable de l’établissement.');
    throw error;
  }
  if (!updated?.length) throw new NotFoundError('Droit « Modifier un responsable légal » manquant.');

  const { error: linkError } = await supabase
    .from('student_guardians')
    .update({ relationship: input.relationship, is_primary_contact: input.isPrimaryContact })
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('guardian_id', g.id);
  if (linkError) throw linkError;
  if (input.isPrimaryContact) await makePrimary(supabase, ctx, studentId, g.id);

  // Son accès suit son nouveau numéro : sinon il ne pourrait plus se connecter.
  if (phoneChanged && g.user_id) await moveGuardianLogin(ctx, g.user_id, phone);

  await audit(ctx, {
    action: 'guardians.update',
    module: 'students',
    entityType: 'guardian',
    entityId: g.id,
    before: { first_name: g.first_name, last_name: g.last_name, phone: g.phone_e164, relationship: link.relationship, primary: link.is_primary_contact, studentId },
    after: { first_name: input.firstName, last_name: input.lastName, phone, relationship: input.relationship, primary: input.isPrimaryContact, studentId },
  });
}

export async function addGuardian(ctx: TenantContext, studentId: string, input: GuardianEditInput): Promise<void> {
  requireWritable(ctx, 'guardians.create');
  const supabase = await createClient();
  // L'élève doit être visible de la personne (et de cette école).
  const { data: student } = await supabase.from('students').select('id').eq('school_id', ctx.school.id).eq('id', studentId).maybeSingle();
  if (!student) throw new NotFoundError('Élève introuvable.');
  const { count } = await supabase
    .from('student_guardians')
    .select('guardian_id', { count: 'exact', head: true })
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId);
  if ((count ?? 0) >= 4) throw new ValidationError('Quatre responsables au plus par élève.');

  const result = await attachGuardian(ctx, studentId, input);
  if (input.isPrimaryContact) await makePrimary(supabase, ctx, studentId, result.guardianId);

  await audit(ctx, {
    action: 'guardians.attach',
    module: 'students',
    entityType: 'guardian',
    entityId: result.guardianId,
    after: { studentId, name: result.name, relationship: input.relationship, accountCreated: result.accountCreated },
  });
}

/** Retire le responsable de CET élève. Sa fiche et son accès restent : il peut avoir d'autres enfants. */
export async function detachGuardian(ctx: TenantContext, studentId: string, guardianId: string): Promise<void> {
  requireWritable(ctx, 'guardians.delete');
  const supabase = await createClient();
  const link = await loadLink(supabase, ctx, studentId, guardianId);
  const { data, error } = await supabase
    .from('student_guardians')
    .delete()
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('guardian_id', guardianId)
    .select('guardian_id');
  if (error) throw error;
  if (!data?.length) throw new NotFoundError('Droit « Supprimer un responsable légal » manquant.');

  await audit(ctx, {
    action: 'guardians.detach',
    module: 'students',
    entityType: 'guardian',
    entityId: guardianId,
    before: { studentId, name: `${link.guardians.first_name} ${link.guardians.last_name}`, relationship: link.relationship },
  });
}
