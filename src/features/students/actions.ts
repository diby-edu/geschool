'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { enrollSchemaFor } from './schemas';
import { enrollStudent, type GuardianInput } from '@/services/enrollment';
import { transferStudent, withdrawStudent, reinstateStudent } from './enrollment-changes';
import { readLeaveStatus } from './enrollment-changes-types';
import { reenrollStudents } from './reenrollment';
import { ValidationError } from '@/lib/errors';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';
import { audit } from '@/lib/audit';
import { uploadAvatar } from '@/lib/storage/avatars';
import { createClient } from '@/lib/supabase/server';
import { assignLanguageGroup } from '@/features/groups/language';

/** Extrait jusqu'a 2 responsables des champs g1_* / g2_* (pere / mere). */
function parseGuardians(fd: FormData): GuardianInput[] {
  const out: GuardianInput[] = [];
  for (const i of [1, 2]) {
    const phone = String(fd.get(`g${i}_phone`) ?? '').trim();
    if (phone === '') continue; // responsable non renseigne
    out.push({
      firstName: String(fd.get(`g${i}_firstName`) ?? '').trim(),
      lastName: String(fd.get(`g${i}_lastName`) ?? '').trim(),
      phone,
      relationship: (String(fd.get(`g${i}_relationship`) ?? 'OTHER') as GuardianInput['relationship']),
      isPrimaryContact: out.length === 0, // le premier renseigne est contact principal
    });
  }
  return out;
}

export async function enrollAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'students.create');

    const policy = await enrollmentPolicy(ctx);
    const parsed = enrollSchemaFor(matriculeIsRequired(policy)).parse({
      matricule: fd.get('matricule') ?? '',
      firstName: fd.get('firstName'),
      lastName: fd.get('lastName'),
      gender: fd.get('gender') ?? '',
      birthDate: fd.get('birthDate') ?? '',
      birthPlace: fd.get('birthPlace') ?? '',
      classId: fd.get('classId'),
      isRepeating: fd.get('isRepeating') === 'on' || fd.get('isRepeating') === 'true',
      isStateAssigned: fd.get('isStateAssigned') ?? '',
      lv2: fd.get('lv2') ?? '',
      guardians: parseGuardians(fd),
    });

    const result = await enrollStudent(ctx, {
      matricule: parsed.matricule || null,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      gender: parsed.gender,
      birthDate: parsed.birthDate,
      birthPlace: parsed.birthPlace,
      classId: parsed.classId,
      isRepeating: parsed.isRepeating,
      isStateAssigned: parsed.isStateAssigned === '1',
      guardians: parsed.guardians,
    });

    // La langue declaree range l'eleve dans son groupe, en le creant au besoin.
    // Un echec ici ne doit jamais annuler une inscription deja actee : on le
    // dit, on ne le cache pas.
    let lv2Warning: string | null = null;
    if (parsed.lv2) {
      try {
        await assignLanguageGroup(ctx, ctx.academicYear!.id, {
          studentId: result.studentId,
          classId: parsed.classId,
          language: parsed.lv2,
        });
      } catch (err) {
        console.error('[enrollAction] groupe de langue', err);
        lv2Warning = `Inscription enregistree, mais le groupe « ${parsed.lv2} » n'a pas pu etre rejoint.`;
      }
    }

    await audit(ctx, {
      action: 'students.enroll',
      module: 'students',
      entityType: 'student',
      entityId: result.studentId,
      after: { matricule: result.matricule, guardians: result.guardians.length },
    });

    // Photo facultative : un echec ici (droit manquant, etc.) ne doit jamais
    // faire echouer l'inscription elle-meme, deja actee.
    const photo = fd.get('photo');
    if (photo instanceof File && photo.size > 0) {
      try {
        const path = await uploadAvatar(ctx, 'students', result.studentId, photo);
        const supabase = await createClient();
        await supabase.from('students').update({ photo_url: path }).eq('school_id', ctx.school.id).eq('id', result.studentId);
      } catch (err) {
        console.error('[enrollAction] photo upload failed', err);
      }
    }

    redirect(
      `/e/${slug}/students/${result.studentId}?enrolled=1${lv2Warning ? `&avertissement=${encodeURIComponent(lv2Warning)}` : ''}`,
    );
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

// --- Vie scolaire : changer de classe, partir, revenir -----------------------

/** Changer un élève de classe, en laissant une trace dans son parcours. */
export async function transferStudentAction(slug: string, studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await transferStudent(ctx, {
      studentId,
      toClassId: String(fd.get('toClassId') ?? ''),
      effectiveOn: String(fd.get('effectiveOn') ?? '') || new Date().toISOString().slice(0, 10),
      reason: String(fd.get('reason') ?? '').trim(),
    });
    redirect(`/e/${slug}/students/${studentId}?transfere=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Enregistrer le départ d'un élève. */
export async function withdrawStudentAction(slug: string, studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const status = readLeaveStatus(fd.get('leaveStatus'));
    if (!status) throw new ValidationError('Choisissez le motif du départ.');
    await withdrawStudent(ctx, {
      studentId,
      status,
      leftOn: String(fd.get('leftOn') ?? '') || new Date().toISOString().slice(0, 10),
      reason: String(fd.get('leaveReason') ?? '').trim(),
    });
    redirect(`/e/${slug}/students/${studentId}?parti=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Annuler un départ : l'élève reprend sa place. */
export async function reinstateStudentAction(slug: string, studentId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reinstateStudent(ctx, studentId);
    redirect(`/e/${slug}/students/${studentId}?revenu=1`);
  });
}

/** Faire monter une classe entière à l'année suivante. */
export async function reenrollAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const { enrolled, skipped } = await reenrollStudents(ctx, {
      targetYearId: String(fd.get('targetYearId') ?? ''),
      toClassId: String(fd.get('toClassId') ?? ''),
      studentIds: fd.getAll('studentIds').map(String).filter(Boolean),
      repeatingIds: fd.getAll('repeatingIds').map(String).filter(Boolean),
    });
    const params = new URLSearchParams({
      annee: String(fd.get('targetYearId') ?? ''),
      source: String(fd.get('fromClassId') ?? ''),
      inscrits: String(enrolled),
      ignores: String(skipped),
    });
    redirect(`/e/${slug}/students/reinscription?${params.toString()}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}
