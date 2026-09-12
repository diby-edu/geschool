import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { normalizePhone } from '@/lib/auth/identifier';
import type { TenantContext } from '@/lib/tenant/context';
import { ValidationError } from '@/lib/errors';

/**
 * Orchestration d'inscription (docs/ACCESS_MANAGEMENT.md §3). En UNE operation :
 * eleve -> matricule -> inscription -> responsables (rechercher-ou-creer) ->
 * comptes Auth -> account_access -> envois d'identifiants en attente.
 *
 * L'utilisateur administratif ne cree jamais le parent separement : ses
 * informations sont saisies dans le dossier et les comptes en decoulent.
 *
 * Utilise le client service_role : creation de comptes Auth, ecriture des
 * account_access. Chaque compte neuf recoit un mot de passe aleatoire jete
 * aussitot (le vrai secret temporaire sera genere a l'envoi, ADR-006) et
 * must_change_password = true.
 */

export type GuardianInput = {
  firstName: string;
  lastName: string;
  phone: string; // format local ou E.164
  relationship: 'FATHER' | 'MOTHER' | 'TUTOR' | 'LEGAL_GUARDIAN' | 'SIBLING' | 'OTHER';
  isPrimaryContact: boolean;
};

export type EnrollInput = {
  firstName: string;
  lastName: string;
  gender: 'M' | 'F' | 'OTHER' | null;
  birthDate: string | null;
  classId: string;
  guardians: GuardianInput[];
};

export type EnrollResult = {
  studentId: string;
  matricule: string;
  studentAccountCreated: boolean;
  guardians: { guardianId: string; name: string; accountCreated: boolean; deliveryId: string | null }[];
};

const SYNTH_DOMAIN = () => serverEnv().AUTH_SYNTHETIC_EMAIL_DOMAIN;

/** Cree un compte Auth avec mot de passe aleatoire jete (secret reel a l'envoi). */
async function createAuthAccount(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  meta: Record<string, string>,
): Promise<string> {
  const throwaway = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: throwaway,
    email_confirm: true,
    user_metadata: meta,
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? 'inconnu'}`);
  return data.user.id;
}

export async function enrollStudent(ctx: TenantContext, input: EnrollInput): Promise<EnrollResult> {
  if (!ctx.academicYear) throw new ValidationError("Activez une annee scolaire avant d'inscrire.");
  const admin = createAdminClient('auth.create_user');
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear.id;

  // Compte Auth de l'eleve d'abord (independant du matricule)
  const studentAuthEmail = `s.${crypto.randomUUID()}@${SYNTH_DOMAIN()}`;
  const studentUid = await createAuthAccount(admin, studentAuthEmail, {
    display_name: `${input.firstName} ${input.lastName}`,
    first_name: input.firstName,
    last_name: input.lastName,
  });

  // Matricule atomique, avec reprise en cas de collision : un matricule
  // preexistant (import, saisie manuelle, jeu de demo) ne doit pas bloquer
  // l'inscription. On avance dans la sequence jusqu'a un numero libre.
  const yearLabel = ctx.academicYear.name.slice(0, 4);
  let matricule = '';
  let studentId: string | null = null;
  for (let attempt = 0; attempt < 100 && !studentId; attempt++) {
    const { data: seq, error: seqError } = await admin.rpc('next_matricule_seq' as never, {
      p_school: schoolId,
      p_year: yearId,
    } as never);
    if (seqError) {
      await admin.auth.admin.deleteUser(studentUid).catch(() => {});
      throw seqError;
    }
    matricule = `ELV-${yearLabel}-${String(seq).padStart(6, '0')}`;

    const { data: student, error: studentError } = await admin
      .from('students')
      .insert({
        school_id: schoolId,
        user_id: studentUid,
        matricule,
        first_name: input.firstName,
        last_name: input.lastName,
        gender: input.gender,
        birth_date: input.birthDate,
        status: 'ACTIVE',
        created_by: ctx.user.id,
      })
      .select('id')
      .single();

    if (!studentError) {
      studentId = student.id;
    } else if (studentError.code === '23505') {
      continue; // matricule deja pris : on prend le suivant
    } else {
      await admin.auth.admin.deleteUser(studentUid).catch(() => {});
      throw studentError;
    }
  }
  if (!studentId) {
    await admin.auth.admin.deleteUser(studentUid).catch(() => {});
    throw new ValidationError("Impossible d'attribuer un matricule libre.");
  }

  // 2. Inscription dans la classe
  await admin.from('student_enrollments').insert({
    school_id: schoolId,
    student_id: studentId,
    academic_year_id: yearId,
    class_id: input.classId,
    status: 'ENROLLED',
  });

  // 3. Compte + membership + acces de l'eleve
  await admin.from('school_memberships').insert({ school_id: schoolId, user_id: studentUid, status: 'ACTIVE' });
  await grantRole(admin, schoolId, studentUid, 'STUDENT');
  await admin.from('account_access').insert({
    school_id: schoolId,
    user_id: studentUid,
    subject_kind: 'STUDENT',
    login_kind: 'MATRICULE',
    login_identifier: matricule,
    account_status: 'CREATED',
    activation_status: 'NOT_ACTIVATED',
    must_change_password: true,
    created_by: ctx.user.id,
  });
  await admin.from('access_events').insert({
    school_id: schoolId, user_id: studentUid, event_type: 'ACCOUNT_CREATED', actor_id: ctx.user.id,
  });

  // 4. Responsables : rechercher-ou-creer sur (school, phone) — additif §4
  const guardians: EnrollResult['guardians'] = [];
  for (const g of input.guardians) {
    const phone = normalizePhone(g.phone, ctx.school.countryCode);
    if (!phone) throw new ValidationError(`Telephone invalide pour ${g.firstName} ${g.lastName}.`);

    const { data: existing } = await admin
      .from('guardians')
      .select('id, user_id')
      .eq('school_id', schoolId)
      .eq('phone_e164', phone)
      .maybeSingle();

    let guardianId: string;
    let guardianUid: string;
    let accountCreated = false;

    if (existing) {
      guardianId = existing.id;
      guardianUid = existing.user_id!;
    } else {
      const email = `p.${crypto.randomUUID()}@${SYNTH_DOMAIN()}`;
      guardianUid = await createAuthAccount(admin, email, {
        display_name: `${g.firstName} ${g.lastName}`,
        first_name: g.firstName,
        last_name: g.lastName,
      });
      const { data: newGuardian } = await admin
        .from('guardians')
        .insert({
          school_id: schoolId,
          user_id: guardianUid,
          first_name: g.firstName,
          last_name: g.lastName,
          phone_e164: phone,
          status: 'ACTIVE',
          created_by: ctx.user.id,
        })
        .select('id')
        .single();
      guardianId = newGuardian!.id;
      accountCreated = true;

      await admin.from('school_memberships').insert({ school_id: schoolId, user_id: guardianUid, status: 'ACTIVE' });
      await grantRole(admin, schoolId, guardianUid, 'PARENT');
      await admin.from('account_access').insert({
        school_id: schoolId,
        user_id: guardianUid,
        subject_kind: 'GUARDIAN',
        login_kind: 'PHONE',
        login_identifier: phone,
        account_status: 'CREATED',
        activation_status: 'NOT_ACTIVATED',
        must_change_password: true,
        created_by: ctx.user.id,
      });
      await admin.from('access_events').insert({
        school_id: schoolId, user_id: guardianUid, event_type: 'ACCOUNT_CREATED', actor_id: ctx.user.id,
      });
    }

    // Relation eleve <-> responsable (idempotente)
    await admin.from('student_guardians').upsert(
      {
        school_id: schoolId,
        student_id: studentId,
        guardian_id: guardianId,
        relationship: g.relationship,
        is_primary_contact: g.isPrimaryContact,
      },
      { onConflict: 'student_id,guardian_id' },
    );

    // Envoi d'identifiants EN ATTENTE pour un compte neuf
    let deliveryId: string | null = null;
    if (accountCreated) {
      const { data: delivery } = await admin
        .from('credential_deliveries')
        .insert({
          school_id: schoolId,
          user_id: guardianUid,
          reason: 'INITIAL',
          channel: 'SMS',
          recipient: phone,
          status: 'PENDING',
          idempotency_key: `initial-${guardianUid}`,
        })
        .select('id')
        .single();
      deliveryId = delivery?.id ?? null;
    }

    guardians.push({ guardianId, name: `${g.firstName} ${g.lastName}`, accountCreated, deliveryId });
  }

  return {
    studentId,
    matricule,
    studentAccountCreated: true,
    guardians,
  };
}

async function grantRole(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  userId: string,
  roleCode: string,
): Promise<void> {
  const { data: membership } = await admin
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return;
  const { data: role } = await admin
    .from('roles')
    .select('id')
    .is('school_id', null)
    .eq('code', roleCode)
    .maybeSingle();
  if (!role) return;
  await admin
    .from('membership_roles')
    .upsert({ membership_id: membership.id, role_id: role.id }, { onConflict: 'membership_id,role_id', ignoreDuplicates: true });
}
