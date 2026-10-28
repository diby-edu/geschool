'use server';

import { redirect } from 'next/navigation';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { requireAdmin } from './admin';
import { ALERT_CHECKS, normalizeAlertSettings } from './alerts-core';
import { writeAlertSettings } from './alerts';

/** Réglages des alertes (lot B) : où, quand, à partir de quels seuils. */
export async function saveAlertSettingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const on = (k: string) => fd.get(k) != null;
    const settings = normalizeAlertSettings({
      sms: on('sms'),
      email: on('email'),
      phone: fd.get('phone'),
      emailTo: fd.get('emailTo'),
      quietNight: on('quietNight'),
      reminderHours: fd.get('reminderHours'),
      checks: Object.fromEntries(ALERT_CHECKS.map((c) => [c.key, on(`check_${c.key}`)])),
      thresholds: Object.fromEntries(
        ['slowMs', 'diskPct', 'memPct', 'dbPct', 'smsCredit', 'certDays', 'errorsPerHour', 'loginFailsPerHour'].map((k) => [k, fd.get(k)]),
      ),
    });
    if (settings.sms && !settings.phone) throw new ValidationError('Indiquez le numéro qui recevra les alertes par SMS.');
    if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.emailTo)) throw new ValidationError('Indiquez une adresse e-mail valide.');
    await writeAlertSettings(userId, settings);
    await auditPlatform(userId, { action: 'platform.alerts_settings', module: 'platform', after: settings });
    redirect('/admin/technique?onglet=alertes&enregistre=1');
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}

/** « Envoyer une alerte d'essai » : vérifie que SMS et e-mail arrivent vraiment. */
export async function sendTestAlertAction(_p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const { sendTestAlert } = await import('@/services/platform-alerts');
    const r = await sendTestAlert();
    await auditPlatform(userId, { action: 'platform.alerts_test', module: 'platform', after: r });
    redirect(`/admin/technique?onglet=alertes&essai=${encodeURIComponent(`SMS : ${r.sms} · e-mail : ${r.email}`)}`);
  });
}
