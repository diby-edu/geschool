import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyEach } from './notifications';

/**
 * Rappels aux enseignants (0171), lancés par le programme de tâches.
 *
 *  - « Appel à faire » : au début de chaque heure de cours dont l'appel n'est
 *    pas encore fait (un cours de 3 h = 3 rappels, 0170).
 *  - « Saisie des notes bientôt fermée » : trois jours avant l'arrêt des notes
 *    de la période.
 */

const WINDOW_MS = 5 * 60_000;

function clock(iso: string, tz: string): string {
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

export async function remindAttendance(now = new Date()): Promise<number> {
  const admin = createAdminClient('notifications.send');
  const { data, error } = await admin.rpc('attendance_reminders' as never, {
    p_from: new Date(now.getTime() - WINDOW_MS).toISOString(),
    p_to: now.toISOString(),
  } as never);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    school_id: string;
    occurrence_id: string;
    hour: number;
    hours: number;
    hour_start: string;
    hour_end: string;
    subject: string;
    class_name: string | null;
    user_ids: string[];
  }[];
  if (rows.length === 0) return 0;

  const schools = [...new Set(rows.map((r) => r.school_id))];
  const { data: tz } = await admin.from('schools').select('id, timezone').in('id', schools);
  const zone = new Map(((tz ?? []) as { id: string; timezone: string | null }[]).map((s) => [s.id, s.timezone || 'Africa/Abidjan']));

  let sent = 0;
  for (const school of schools) {
    const z = zone.get(school) ?? 'Africa/Abidjan';
    sent += await notifyEach(
      school,
      rows
        .filter((r) => r.school_id === school)
        .map((r) => ({
          userIds: r.user_ids,
          input: {
            type: 'attendance.todo',
            title: r.hours > 1 ? `Appel de ${clock(r.hour_start, z)} à faire` : 'Appel à faire',
            body: `${r.class_name ?? 'Classe'} — ${r.subject}, ${clock(r.hour_start, z)} – ${clock(r.hour_end, z)}.`,
            entityType: 'session_occurrence',
            entityId: r.occurrence_id,
            href: '/attendance',
          },
        })),
    );
  }
  return sent;
}

export async function remindGradesClosing(today = new Date()): Promise<number> {
  const admin = createAdminClient('notifications.send');
  const inThree = new Date(today.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const { data: periods } = await admin
    .from('academic_periods')
    .select('school_id, academic_year_id, name, grades_stop_on')
    .eq('grades_stop_on', inThree)
    .eq('is_grading_period', true);
  let sent = 0;
  for (const p of (periods ?? []) as { school_id: string; academic_year_id: string; name: string; grades_stop_on: string }[]) {
    const { data: profs } = await admin.from('teachers').select('user_id').eq('school_id', p.school_id).is('deleted_at', null).not('user_id', 'is', null);
    const ids = ((profs ?? []) as { user_id: string | null }[]).map((t) => t.user_id).filter((x): x is string => Boolean(x));
    const jour = new Date(`${p.grades_stop_on}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    sent += await notifyEach(p.school_id, [
      {
        userIds: ids,
        input: {
          type: 'grades.closing',
          title: 'Saisie des notes bientôt fermée',
          body: `${p.name} : la saisie des notes ferme ${jour}, dans 3 jours. Pensez à terminer vos évaluations.`,
          href: '/evaluations/mine',
        },
      },
    ]);
  }
  return sent;
}
