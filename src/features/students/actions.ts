'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { enrollSchema } from './schemas';
import { enrollStudent, type GuardianInput } from '@/services/enrollment';
import { audit } from '@/lib/audit';
import { uploadAvatar } from '@/lib/storage/avatars';
import { createClient } from '@/lib/supabase/server';

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

    const parsed = enrollSchema.parse({
      firstName: fd.get('firstName'),
      lastName: fd.get('lastName'),
      gender: fd.get('gender') ?? '',
      birthDate: fd.get('birthDate') ?? '',
      classId: fd.get('classId'),
      guardians: parseGuardians(fd),
    });

    const result = await enrollStudent(ctx, {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      gender: parsed.gender ? (parsed.gender as 'M' | 'F' | 'OTHER') : null,
      birthDate: parsed.birthDate || null,
      classId: parsed.classId,
      guardians: parsed.guardians,
    });

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

    redirect(`/e/${slug}/students/${result.studentId}?enrolled=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}
