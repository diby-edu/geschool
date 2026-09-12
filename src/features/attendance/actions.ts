'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { justificationSchema } from './schemas';
import { submitRegister, validateRegister } from './registers';
import { submitJustification, decideJustification } from './justifications';

export async function submitRegisterAction(slug: string, occurrenceId: string, registerId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await submitRegister(ctx, registerId);
    redirect(`/e/${slug}/attendance/${occurrenceId}?submitted=1`);
  });
}

export async function validateRegisterAction(slug: string, occurrenceId: string, registerId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await validateRegister(ctx, registerId);
    redirect(`/e/${slug}/attendance/${occurrenceId}?validated=1`);
  });
}

export async function submitJustificationAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await submitJustification(ctx, justificationSchema.parse({
      studentId: fd.get('studentId'),
      coversFrom: fd.get('coversFrom'),
      coversTo: fd.get('coversTo'),
      reason: fd.get('reason'),
    }));
    redirect(`/e/${slug}/attendance/justificatifs?submitted=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function decideJustificationAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const decision = fd.get('decision') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const { excused } = await decideJustification(ctx, id, decision, String(fd.get('comment') ?? ''));
    redirect(`/e/${slug}/attendance/justificatifs?decided=${decision === 'APPROVED' ? `ok-${excused}` : 'no'}`);
  });
}
