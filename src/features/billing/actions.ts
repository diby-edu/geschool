'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { planSchema, subscriptionSchema, paymentSchema } from './schemas';
import { assertPlatformAdmin, savePlan, deletePlan, assignSubscription, settleDeclaredPayment } from './platform';
import { deleteModule, saveModule } from './modules';
import { getAuthenticatedUser } from '@/lib/supabase/server';
import { UnauthenticatedError } from '@/lib/errors';
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

/** Confirme ou refuse un paiement déclaré par un établissement (Super Admin). */
export async function settlePaymentAction(
  schoolId: string,
  paymentId: string,
  outcome: 'PAID' | 'CANCELLED',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    const user = await getAuthenticatedUser();
    if (!user) throw new UnauthenticatedError();
    await settleDeclaredPayment(user.id, schoolId, paymentId, outcome);
    redirect(`/admin/facturation/${schoolId}?${outcome === 'PAID' ? 'confirmed' : 'rejected'}=1`);
  });
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

/** Catalogue des modules vendables (Super Admin). */
export async function saveModuleAction(id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    const period = String(fd.get('billingPeriod') ?? 'YEARLY');
    const price = Number(fd.get('priceAmount') ?? 0);
    await saveModule(
      {
        code: String(fd.get('code') ?? '').trim().toUpperCase(),
        name: String(fd.get('name') ?? '').trim(),
        description: String(fd.get('description') ?? '').trim(),
        priceAmount: Number.isFinite(price) ? Math.max(0, price) : 0,
        currency: String(fd.get('currency') ?? 'XOF').trim() || 'XOF',
        billingPeriod: (['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'].includes(period)
          ? period
          : 'YEARLY') as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME',
        isActive: fd.get('isActive') != null,
      },
      id ?? undefined,
    );
    redirect('/admin/plans?module=1');
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteModuleAction(id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await assertPlatformAdmin();
    await deleteModule(id);
    redirect('/admin/plans?module_supprime=1');
  });
}
