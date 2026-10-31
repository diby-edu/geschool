'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { requireAdmin } from './admin';
import { TASKS, type TaskName } from './technical';

/** L'onglet où l'on revient après une tâche : là où son effet se voit. */
const TAB_OF: Record<TaskName, string> = {
  'billing-expire-due': 'taches',
  'db-backup': 'base',
  'attendance-alerts': 'taches',
  'sms-delivery-reports': 'taches',
  'platform-metrics': 'serveur',
  'online-payments-check': 'taches',
};

/**
 * « Lancer maintenant » une tâche de nuit (lot 7) : le même travail que le
 * worker, tout de suite. Utile tant que le worker ne tourne pas, et pour
 * vérifier qu'une tâche marche. Chaque lancement est noté au journal.
 */
async function runTask(task: TaskName, userId: string): Promise<string> {
  let result: string;
  if (task === 'billing-expire-due') {
    const { expireDueSubscriptions } = await import('@/services/billing-nightly');
    const n = await expireDueSubscriptions();
    result = `${n} abonnement(s) passé(s) en « expiré »`;
  } else if (task === 'attendance-alerts') {
    const { runAttendanceAlerts } = await import('@/services/attendance-alerts');
    const b = await runAttendanceAlerts();
    result = `${b.alerts} alerte(s), ${b.notified} personne(s) prévenue(s) sur ${b.schools} école(s)${b.smsSent ? `, ${b.smsSent} SMS` : ''}`;
  } else if (task === 'db-backup') {
    // Quelques minutes : on ne fait pas attendre la page. Le compte rendu
    // apparaît dans « Base et sauvegardes » quand la copie est finie.
    const { runBackup, backupRunning } = await import('@/services/db-backup');
    if (process.platform !== 'linux') result = 'la sauvegarde se fait sur le VPS, pas sur ce poste';
    else if (await backupRunning()) result = 'une sauvegarde est déjà en cours';
    else {
      void runBackup('MANUAL');
      result = 'sauvegarde lancée, elle prend quelques minutes';
    }
  } else if (task === 'online-payments-check') {
    const { recheckPendingPayments } = await import('@/services/online-payments');
    const r = await recheckPendingPayments();
    result = `${r.checked} paiement(s) vérifié(s) : ${r.paid} confirmé(s), ${r.closed} clos`;
  } else if (task === 'platform-metrics') {
    const { recordSnapshot, canRecordHere } = await import('@/services/platform-metrics');
    const snap = await recordSnapshot();
    result = `relevé fait (site ${snap.timings.site === null ? 'sans réponse' : `${snap.timings.site} ms`})${canRecordHere() ? '' : ' — non gardé : seul le VPS enregistre'}`;
  } else {
    const { refreshPendingStatuses } = await import('@/services/sms-log');
    const r = await refreshPendingStatuses(200);
    result = `${r.checked} SMS vérifié(s) : ${r.delivered} arrivé(s), ${r.failed} échec(s)`;
  }
  await auditPlatform(userId, { action: 'platform.task_run', module: 'platform', after: { task, result } });
  return result;
}

export async function runTaskAction(task: TaskName, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    if (!TASKS.some((t) => t.name === task)) throw new ValidationError('Tâche inconnue.');
    const result = await runTask(task, userId);
    redirect(`/admin/technique?onglet=${TAB_OF[task]}&tache=${task}&resultat=${encodeURIComponent(result)}`);
  });
}

/**
 * « Tout lancer maintenant » : toutes les tâches, l'une après l'autre, dans
 * l'ordre de la nuit. Une tâche qui échoue n'empêche pas les suivantes ; la
 * sauvegarde, plus longue, part en arrière-plan.
 */
export async function runAllTasksAction(_p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const lines: string[] = [];
    for (const t of TASKS) {
      try {
        lines.push(`${t.label} : ${await runTask(t.name, userId)}`);
      } catch (e) {
        lines.push(`${t.label} : échec (${e instanceof Error ? e.message : 'erreur'})`);
      }
    }
    redirect(`/admin/technique?onglet=taches&resultats=${encodeURIComponent(lines.join('\n'))}`);
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
    redirect('/admin/technique?onglet=ensemble&vide=1');
  });
}
