'use server';

import { redirect } from 'next/navigation';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { graceDaysOf, writePaymentSettings } from '@/features/billing/payment-settings';
import { requireAdmin } from './admin';
import { normalizePlatformSettings, writePlatformSettings } from './settings';

/** Réglages de la plateforme (lot 6) ; le délai de grâce s'écrit avec les paiements. */
export async function savePlatformSettingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const email = String(fd.get('supportEmail') ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('E-mail du support invalide.');
    const settings = normalizePlatformSettings(Object.fromEntries(fd.entries()) as Record<string, unknown>);
    const graceDays = graceDaysOf(fd.get('graceDays'));
    await writePlatformSettings(userId, settings);
    await writePaymentSettings(userId, { graceDays });
    await auditPlatform(userId, { action: 'platform.settings', module: 'platform', after: { ...settings, graceDays } });
    redirect('/admin/reglages?enregistre=1');
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}
