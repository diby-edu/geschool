import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { hasPermission, requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import { STAFF_FUNCTIONS } from '@/lib/permissions/roles';
import type { TenantContext } from '@/lib/tenant/context';
import type { StaffInput, StaffUpdateInput } from '@/features/staff/schemas';
import { findOrCreatePhoneAccess } from './access-provisioning';
import { assertCanGrantFunctions, assertCanManagePerson } from './person-guard';

/**
 * Personnel administratif : dossier (`staff_profiles`), accès de connexion et
 * fonctions (rôles).
 *
 * Les FONCTIONS s'attribuent avec les droits de l'utilisateur, jamais avec le
 * client service_role : la RLS et les garde-fous de la base (migration 0050 — pas
 * d'auto-promotion, fondateur intouchable) s'appliquent alors à chaque
 * attribution, même si ce code se trompait. Seule la création du compte
 * d'authentification passe par le client service_role (findOrCreatePhoneAccess).
 *
 * Une personne = un accès par établissement : si le numéro a déjà un accès (un
 * enseignant qui rejoint aussi la direction), on lui AJOUTE les fonctions, sans
 * second compte ni second mot de passe.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Erreur de la base -> erreur applicative lisible (les garde-fous parlent français). */
function throwDb(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new AuthorizationError(error.message ?? 'Action refusée.');
  if (error.code === '23505') throw new ConflictError('Cette information existe déjà dans l’établissement.');
  throw new Error(error.message ?? 'Erreur base de données');
}

function phoneOrThrow(ctx: TenantContext, raw: string, label: string): string {
  const phone = normalizePhone(raw, ctx.school.countryCode);
  if (!phone) throw new ValidationError(`${label} : numéro invalide.`);
  return phone;
}

/** Identifiant de rôle par code : la copie de l'établissement d'abord, sinon le modèle. */
async function resolveRoleIds(supabase: Supabase, schoolId: string, codes: readonly string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('roles')
    .select('id, code, school_id')
    .in('code', [...codes])
    .or(`school_id.eq.${schoolId},school_id.is.null`);
  if (error) throwDb(error);
  const out = new Map<string, string>();
  for (const r of data ?? []) if (r.school_id === schoolId || !out.has(r.code)) out.set(r.code, r.id);
  return out;
}

async function membershipId(supabase: Supabase, schoolId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwDb(error);
  if (!data) throw new NotFoundError('Personne introuvable dans cet établissement.');
  return data.id;
}

/** Fonctions du personnel actuellement exercées (codes), Fondateur compris. */
async function currentFunctionCodes(supabase: Supabase, membership: string): Promise<string[]> {
  const { data, error } = await supabase.from('membership_roles').select('roles(code)').eq('membership_id', membership);
  if (error) throwDb(error);
  return ((data ?? []) as unknown as { roles: { code: string } | null }[])
    .map((r) => r.roles?.code)
    .filter((c): c is string => !!c);
}

/** Attribue des fonctions (ajoute seulement ce qui manque). */
async function assignFunctions(ctx: TenantContext, supabase: Supabase, userId: string, codes: readonly string[]): Promise<void> {
  const membership = await membershipId(supabase, ctx.school.id, userId);
  const have = new Set(await currentFunctionCodes(supabase, membership));
  const missing = codes.filter((c) => !have.has(c));
  if (missing.length === 0) return;
  const ids = await resolveRoleIds(supabase, ctx.school.id, missing);
  const rows = missing.map((code) => {
    const role_id = ids.get(code);
    if (!role_id) throw new NotFoundError(`Fonction introuvable : ${code}.`);
    return { membership_id: membership, role_id };
  });
  const { error } = await supabase.from('membership_roles').insert(rows);
  if (error) throwDb(error);
}

/**
 * Remplace les fonctions DU PERSONNEL d'une personne (ses autres rôles —
 * enseignant, parent — ne sont pas touchés). Au moins une fonction doit rester.
 */
export async function setStaffFunctions(ctx: TenantContext, userId: string, functions: readonly string[]): Promise<void> {
  requireWritable(ctx, 'users.assign_roles');
  if (userId === ctx.user.id) throw new ValidationError('Vous ne pouvez pas modifier vos propres fonctions.');
  await assertCanManagePerson(ctx, userId);
  const wanted = functions.filter((f) => (STAFF_FUNCTIONS as readonly string[]).includes(f));
  if (wanted.length === 0) throw new ValidationError('Choisissez au moins une fonction.');

  const supabase = await createClient();
  const membership = await membershipId(supabase, ctx.school.id, userId);
  const current = await currentFunctionCodes(supabase, membership);
  const currentStaff = current.filter((c) => (STAFF_FUNCTIONS as readonly string[]).includes(c));
  const toAdd = wanted.filter((c) => !currentStaff.includes(c));
  const toRemove = currentStaff.filter((c) => !wanted.includes(c));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  await assertCanGrantFunctions(ctx, toAdd);
  await assignFunctions(ctx, supabase, userId, toAdd);
  if (toRemove.length > 0) {
    const ids = await resolveRoleIds(supabase, ctx.school.id, toRemove);
    const { error } = await supabase
      .from('membership_roles')
      .delete()
      .eq('membership_id', membership)
      .in('role_id', [...ids.values()]);
    if (error) throwDb(error);
  }
  await audit(ctx, {
    action: 'staff.functions',
    module: 'staff',
    entityType: 'user',
    entityId: userId,
    after: { added: toAdd, removed: toRemove },
  });
}

async function assertStaffNumberFree(supabase: Supabase, schoolId: string, staffNumber: string, exceptUserId?: string) {
  let query = supabase
    .from('staff_profiles' as never)
    .select('user_id')
    .eq('school_id', schoolId)
    .eq('staff_number', staffNumber);
  if (exceptUserId) query = query.neq('user_id', exceptUserId);
  const { data } = await query.maybeSingle();
  if (data) throw new ConflictError('Un membre du personnel porte déjà ce matricule.');
}

export type CreateStaffResult = {
  userId: string;
  /** CREATED = compte neuf ; LINKED = le numéro avait déjà un accès, les fonctions lui ont été ajoutées. */
  outcome: 'CREATED' | 'LINKED';
  existingKind: string | null;
};

export async function createStaff(ctx: TenantContext, input: StaffInput): Promise<CreateStaffResult> {
  // Créer une personne ET lui donner une fonction : les deux droits sont nécessaires.
  requireWritable(ctx, 'users.create');
  requireWritable(ctx, 'users.assign_roles');

  const phone = phoneOrThrow(ctx, input.phone, 'Téléphone principal');
  const phone2 = input.phone2 ? phoneOrThrow(ctx, input.phone2, 'Second téléphone') : null;
  await assertCanGrantFunctions(ctx, input.functions);

  const supabase = await createClient();
  const staffNumber = input.staffNumber?.trim().toUpperCase().replace(/\s+/g, '') || null;
  if (staffNumber) await assertStaffNumberFree(supabase, ctx.school.id, staffNumber);

  const access = await findOrCreatePhoneAccess(ctx, {
    phone,
    firstName: input.firstName,
    lastName: input.lastName,
    role: null,
    subjectKind: 'STAFF',
  });

  try {
    const { data: already } = await supabase
      .from('staff_profiles' as never)
      .select('user_id')
      .eq('school_id', ctx.school.id)
      .eq('user_id', access.userId)
      .maybeSingle();
    if (already) throw new ConflictError('Cette personne fait déjà partie du personnel.');

    await assignFunctions(ctx, supabase, access.userId, input.functions);

    const { error } = await supabase.from('staff_profiles' as never).insert({
      school_id: ctx.school.id,
      user_id: access.userId,
      staff_number: staffNumber,
      first_name: input.firstName,
      last_name: input.lastName,
      gender: input.gender,
      birth_date: input.birthDate || null,
      birth_place: input.birthPlace || null,
      phone_e164: phone,
      phone2_e164: phone2,
      email: input.email || null,
      diploma: input.diploma || null,
      diploma_detail: input.diplomaDetail || null,
      hire_date: input.hireDate || null,
      employment_type: input.employmentType,
      created_by: ctx.user.id,
    } as never);
    if (error) throwDb(error);
  } catch (error) {
    // Compte neuf resté sans fonction ni dossier : on le retire plutôt que de laisser
    // une personne invisible dans la liste (elle n'a aucune fonction du personnel).
    if (access.created) await createAdminClient('auth.delete_user').auth.admin.deleteUser(access.userId).catch(() => {});
    throw error;
  }

  await audit(ctx, {
    action: 'staff.create',
    module: 'staff',
    entityType: 'user',
    entityId: access.userId,
    after: { functions: input.functions, outcome: access.created ? 'CREATED' : 'LINKED' },
  });
  return { userId: access.userId, outcome: access.created ? 'CREATED' : 'LINKED', existingKind: access.existingKind };
}

/** Modifie le dossier (créé au besoin : le fondateur n'en a pas au départ) et, si demandé, les fonctions. */
export async function updateStaff(ctx: TenantContext, userId: string, input: StaffUpdateInput): Promise<void> {
  requireWritable(ctx, 'users.update');
  await assertCanManagePerson(ctx, userId);
  const isSelf = userId === ctx.user.id;
  // Vérifié AVANT toute écriture : un refus ne doit pas laisser le dossier à moitié modifié.
  if (input.functions && input.functions.length === 0) throw new ValidationError('Choisissez au moins une fonction.');

  const phone2 = input.phone2 ? phoneOrThrow(ctx, input.phone2, 'Second téléphone') : null;
  const supabase = await createClient();
  const staffNumber = input.staffNumber?.trim().toUpperCase().replace(/\s+/g, '') || null;
  if (staffNumber) await assertStaffNumberFree(supabase, ctx.school.id, staffNumber, userId);

  const fields = {
    staff_number: staffNumber,
    first_name: input.firstName,
    last_name: input.lastName,
    gender: input.gender,
    birth_date: input.birthDate || null,
    birth_place: input.birthPlace || null,
    phone2_e164: phone2,
    email: input.email || null,
    diploma: input.diploma || null,
    diploma_detail: input.diplomaDetail || null,
    hire_date: input.hireDate || null,
    employment_type: input.employmentType,
  };

  const { data: existing } = await supabase
    .from('staff_profiles' as never)
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('staff_profiles' as never)
      .update(fields as never)
      .eq('school_id', ctx.school.id)
      .eq('user_id', userId);
    if (error) throwDb(error);
  } else {
    // Première fiche (fondateur, ou dossier manquant) : le téléphone est celui de l'accès.
    const admin = createAdminClient('access.person_guard');
    const { data: access } = await admin
      .from('account_access')
      .select('login_kind, login_identifier')
      .eq('school_id', ctx.school.id)
      .eq('user_id', userId)
      .maybeSingle();
    const { error } = await supabase.from('staff_profiles' as never).insert({
      school_id: ctx.school.id,
      user_id: userId,
      phone_e164: access?.login_kind === 'PHONE' ? access.login_identifier : null,
      created_by: ctx.user.id,
      ...fields,
    } as never);
    if (error) throwDb(error);
  }

  if (input.functions && !isSelf && hasPermission(ctx, 'users.assign_roles')) {
    await setStaffFunctions(ctx, userId, input.functions);
  }
  await audit(ctx, { action: 'staff.update', module: 'staff', entityType: 'user', entityId: userId });
}
