'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { planSchema, subscriptionSchema, paymentSchema } from './schemas';
import { assertPlatformAdmin, savePlan, deletePlan, assignSubscription } from './platform';
import { recordPayment } from './school';

// --- Plateforme (Super Admin) ------------------------------------------------

export async function savePlanAction(id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    await savePlan(
      planSchema.parse({
        code: fd.get('code'),
        name: fd.get('name'),
        description: fd.get('description') ?? '',
        priceAmount: fd.get('priceAmount'),
        currency: fd.get('currency') ?? 'XOF',
        billingPeriod: fd.get('billingPeriod'),
        limitStudents: fd.get('limitStudents') ?? 0,
        limitUsers: fd.get('limitUsers') ?? 0,
        limitStorageMb: fd.get('limitStorageMb') ?? 0,
        limitSms: fd.get('limitSms') ?? 0,
        isPublic: fd.get('isPublic') === 'on' || fd.get('isPublic') === 'true',
        isActive: fd.get('isActive') === 'on' || fd.get('isActive') === 'true',
      }),
      id ?? undefined,
    );
    redirect(`/admin/plans?saved=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deletePlanAction(id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    await deletePlan(id);
    redirect(`/admin/plans?deleted=1`);
  });
}

export async function assignSubscriptionAction(schoolId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    await assignSubscription(
      schoolId,
      subscriptionSchema.parse({
        planId: fd.get('planId'),
        status: fd.get('status'),
        trialEndsAt: fd.get('trialEndsAt') ?? '',
        periodStart: fd.get('periodStart') ?? '',
        periodEnd: fd.get('periodEnd') ?? '',
      }),
    );
    redirect(`/admin/facturation/${schoolId}?assigned=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

// --- Établissement (billing.manage) ------------------------------------------

export async function recordPaymentAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await recordPayment(ctx, paymentSchema.parse({
      amount: fd.get('amount'),
      currency: fd.get('currency') ?? 'XOF',
      method: fd.get('method'),
      status: fd.get('status') ?? 'PAID',
      reference: fd.get('reference') ?? '',
      notes: fd.get('notes') ?? '',
    }));
    redirect(`/e/${slug}/facturation?paid=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}
