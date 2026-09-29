import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/auth/identifier';
import { findOrCreatePhoneAccess } from '@/services/access-provisioning';
import type { TenantContext } from '@/lib/tenant/context';
import { ConflictError, ValidationError } from '@/lib/errors';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';

/**
 * Orchestration d'inscription (docs/ACCESS_MANAGEMENT.md §3). En UNE operation :
 * fiche eleve + matricule -> inscription -> responsables (rechercher-ou-creer)
 * -> comptes Auth -> account_access -> envois d'identifiants en attente.
 * L'eleve n'a pas de compte : seuls ses responsables se connectent.
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
  birthPlace?: string | null;
  /**
   * Matricule de l'eleve. Obligatoire quand l'ecole le recoit de l'Etat ; vide,
   * il n'est attribue automatiquement que si le reglage l'y autorise.
   */
  matricule?: string | null;
  classId: string;
  /** L'eleve redouble cette classe. Declare : l'application ne peut pas le deviner. */
  isRepeating?: boolean;
  /** Affecte par l'Etat (true), non affecte (false), non renseigne (null). */
  isStateAssigned?: boolean | null;
  guardians: GuardianInput[];
};

export type EnrollResult = {
  studentId: string;
  matricule: string;
  guardians: { guardianId: string; name: string; accountCreated: boolean; deliveryId: string | null }[];
};

export async function enrollStudent(ctx: TenantContext, input: EnrollInput): Promise<EnrollResult> {
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire avant d'inscrire.");
  const admin = createAdminClient('auth.create_user');
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear.id;

  // L'eleve n'a PAS de compte de connexion : seuls les responsables (et le
  // personnel) se connectent. Sa fiche porte un matricule administratif.

  // Matricule atomique, avec reprise en cas de collision : un matricule
  // preexistant (import, saisie manuelle, jeu de demo) ne doit pas bloquer
  // l'inscription. On avance dans la sequence jusqu'a un numero libre.
  const yearLabel = ctx.academicYear.name.slice(0, 4);
  const imposed = input.matricule?.trim().toUpperCase().replace(/\s+/g, '') || null;
  // Quand l'Etat fournit le matricule, l'application n'en invente jamais : un
  // numero absent est une erreur de saisie, pas une occasion de bricoler.
  if (!imposed && matriculeIsRequired(await enrollmentPolicy(ctx))) {
    throw new ValidationError('Matricule requis : il est attribué par l’État avant l’inscription.');
  }
  let matricule = '';
  let studentId: string | null = null;
  for (let attempt = 0; attempt < 100 && !studentId; attempt++) {
    if (imposed) {
      matricule = imposed;
    } else {
      const { data: seq, error: seqError } = await admin.rpc('next_matricule_seq' as never, {
        p_school: schoolId,
        p_year: yearId,
      } as never);
      if (seqError) throw seqError;
      matricule = `ELV-${yearLabel}-${String(seq).padStart(6, '0')}`;
    }

    const { data: student, error: studentError } = await admin
      .from('students')
      .insert({
        school_id: schoolId,
        matricule,
        first_name: input.firstName,
        last_name: input.lastName,
        gender: input.gender,
        birth_date: input.birthDate,
        birth_place: input.birthPlace || null,
        is_state_assigned: input.isStateAssigned ?? null,
        status: 'ACTIVE',
        created_by: ctx.user.id,
      })
      .select('id')
      .single();

    if (!studentError) {
      studentId = student.id;
    } else if (studentError.code === '23505') {
      // Matricule impose (import) deja pris : on ne l'invente pas a sa place.
      if (imposed) throw new ConflictError(`Le matricule ${imposed} est déjà utilisé.`);
      continue; // matricule deja pris : on prend le suivant
    } else {
      throw studentError;
    }
  }
  if (!studentId) throw new ValidationError("Impossible d'attribuer un matricule libre.");

  // 2. Inscription dans la classe
  await admin.from('student_enrollments').insert({
    school_id: schoolId,
    student_id: studentId,
    academic_year_id: yearId,
    class_id: input.classId,
    is_repeating: input.isRepeating ?? false,
    status: 'ENROLLED',
  });

  // 3. Responsables : rechercher-ou-creer sur (school, phone) — additif §4
  const guardians: EnrollResult['guardians'] = [];
  for (const g of input.guardians) {
    const phone = normalizePhone(g.phone, ctx.school.countryCode);
    if (!phone) throw new ValidationError(`Téléphone invalide pour ${g.firstName} ${g.lastName}.`);

    const { data: existing } = await admin
      .from('guardians')
      .select('id, user_id')
      .eq('school_id', schoolId)
      .eq('phone_e164', phone)
      .maybeSingle();

    let guardianId: string;
    let accountCreated = false;
    let deliveryId: string | null = null;

    if (existing) {
      guardianId = existing.id;
    } else {
      // Le numero a peut-etre deja un acces dans l'ecole (un enseignant qui
      // devient parent) : on lui ajoute le role Parent au lieu de creer un
      // second compte, que la base refuserait.
      const access = await findOrCreatePhoneAccess(ctx, {
        phone,
        firstName: g.firstName,
        lastName: g.lastName,
        role: 'PARENT',
        subjectKind: 'GUARDIAN',
      });
      const { data: newGuardian, error: guardianError } = await admin
        .from('guardians')
        .insert({
          school_id: schoolId,
          user_id: access.userId,
          first_name: g.firstName,
          last_name: g.lastName,
          phone_e164: phone,
          status: 'ACTIVE',
          created_by: ctx.user.id,
        })
        .select('id')
        .single();
      if (guardianError) throw guardianError;
      guardianId = newGuardian.id;
      accountCreated = access.created;
      deliveryId = access.deliveryId;
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

    // (L'envoi d'identifiants EN ATTENTE d'un compte neuf est cree par le service d'acces.)
    guardians.push({ guardianId, name: `${g.firstName} ${g.lastName}`, accountCreated, deliveryId });
  }

  return {
    studentId,
    matricule,
    guardians,
  };
}
