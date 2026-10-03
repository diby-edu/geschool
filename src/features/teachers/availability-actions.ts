'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { createTeacherRule, deleteTeacherRule, AVAILABILITY_KINDS, type AvailabilityKind } from './availability';

/** Les contraintes d'emploi du temps d'un enseignant. */
export async function createAvailabilityAction(
  slug: string,
  teacherId: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const kind = String(fd.get('kind') ?? 'UNAVAILABLE');
    await createTeacherRule(ctx, {
      teacherId,
      dayOfWeek: Number(fd.get('dayOfWeek') ?? 1),
      startsAt: String(fd.get('startsAt') ?? ''),
      endsAt: String(fd.get('endsAt') ?? ''),
      kind: (AVAILABILITY_KINDS.includes(kind as AvailabilityKind) ? kind : 'UNAVAILABLE') as AvailabilityKind,
      reason: String(fd.get('reason') ?? '').trim(),
    });
    redirect(`/e/${slug}/teachers/${teacherId}?contrainte=1`);
  });
}

export async function deleteAvailabilityAction(
  slug: string,
  teacherId: string,
  id: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteTeacherRule(ctx, id);
    redirect(`/e/${slug}/teachers/${teacherId}?contrainte=0`);
  });
}
