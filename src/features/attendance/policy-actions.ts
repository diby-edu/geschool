'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { writeAttendancePolicy } from './policy';
import { ALERT_RECIPIENTS, policyProblem, type AlertRecipient, type AttendancePolicy } from './policy-types';

export async function saveAttendancePolicyAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    const policy: AttendancePolicy = {
      alertAfterHours: Number(String(fd.get('alertAfterHours') ?? '').replace(',', '.')) || 0,
      alertRecipients: fd
        .getAll('alertRecipients')
        .map(String)
        .filter((r): r is AlertRecipient => ALERT_RECIPIENTS.includes(r as AlertRecipient)),
      alertBySms: fd.get('alertBySms') === 'on',
      summonAfterUnjustifiedHours: Number(String(fd.get('summonAfterUnjustifiedHours') ?? '').replace(',', '.')) || 0,
    };
    const probleme = policyProblem(policy);
    if (probleme) throw new ValidationError(probleme);
    await writeAttendancePolicy(ctx, policy);
    redirect(`/e/${slug}/attendance/regles?enregistre=1`);
  });
}
