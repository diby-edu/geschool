'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { requireAdmin } from './admin';
import { TASKS, type TaskName } from './technical';

/**
 * « Lancer maintenant » une tâche de nuit (lot 7) : le même travail que le
 * worker, tout de suite. Utile tant que le worker ne tourne pas, et pour
 * vérifier qu'une tâche marche. Chaque lancement est noté au journal.
 */
export async function runTaskAction(task: TaskName, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    if (!TASKS.some((t) => t.name === task)) throw new ValidationError('Tâche inconnue.');
    let result: string;
    if (task === 'billing-expire-due') {
      const { expireDueSubscriptions } = await import('@/services/billing-nightly');
      const n = await expireDueSubscriptions();
      result = `${n} abonnement(s) passé(s) en « expiré »`;
    } else if (task === 'attendance-alerts') {
      const { runAttendanceAlerts } = await import('@/services/attendance-alerts');
      const b = await runAttendanceAlerts();
      result = `${b.alerts} alerte(s), ${b.notified} personne(s) prévenue(s) sur ${b.schools} école(s)${b.smsSent ? `, ${b.smsSent} SMS` : ''}`;
    } else {
      const { refreshPendingStatuses } = await import('@/services/sms-log');
      const r = await refreshPendingStatuses(200);
      result = `${r.checked} SMS vérifié(s) : ${r.delivered} arrivé(s), ${r.failed} échec(s)`;
    }
    await auditPlatform(userId, { action: 'platform.task_run', module: 'platform', after: { task, result } });
    redirect(`/admin/technique?tache=${task}&resultat=${encodeURIComponent(result)}`);
  });
}

/** Vider le journal des erreurs (après les avoir corrigées). */
export async function clearErrorsAction(_p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from('app_errors' as never).delete().not('id', 'is', null);
    if (error) throw new ValidationError(error.message);
    await auditPlatform(userId, { action: 'platform.errors_clear', module: 'platform' });
    redirect('/admin/technique?vide=1');
  });
}
