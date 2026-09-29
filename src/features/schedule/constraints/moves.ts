import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { loadValidatorSessions } from '../sessions';
import { getConfig, getConfigForClass, listSlots } from '../config';
import { listRules } from './service';
import type { CourseScope } from './apply';
import { moveProblems, type SlotChoice } from './move-check';

export { moveProblems } from './move-check';
export type { SlotChoice, MoveVerdict } from './move-check';

/**
 * Déplacer un cours à la main, sous contrôle.
 *
 * Le validateur indépendant existait déjà et vérifie n'importe quelle liste de
 * séances. Il suffisait de lui soumettre la liste APRÈS le déplacement pour
 * savoir si celui-ci tient : aucune résolution, aucune attente.
 *
 * Et quand il refuse, on peut dire pourquoi chaque autre créneau ne convient
 * pas non plus — en interrogeant l'emploi du temps existant, pas en relançant
 * un calcul. C'est la réponse à « pourquoi M. Yao a-t-il un trou le jeudi ? ».
 */

/** Le créneau actuel d'une séance, et ceux où elle pourrait aller. */
export type MoveOption = { slot: SlotChoice; ok: boolean; reasons: string[]; current: boolean };

export async function moveOptions(ctx: TenantContext, versionId: string, sessionId: string): Promise<MoveOption[]> {
  const supabase = await createClient();

  const [{ data: sessionRaw }, sessions, rules] = await Promise.all([
    supabase
      .from('schedule_sessions')
      .select('id, subject_id, academic_year_id, start_slot_id, schedule_session_targets(class_id)')
      .eq('school_id', ctx.school.id)
      .eq('id', sessionId)
      .maybeSingle(),
    loadValidatorSessions(ctx, versionId),
    listRules(ctx),
  ]);
  const session = sessionRaw as unknown as {
    id: string;
    subject_id: string;
    academic_year_id: string;
    start_slot_id: string;
    schedule_session_targets: { class_id: string | null }[];
  } | null;
  if (!session) throw new NotFoundError('Séance introuvable.');

  const current = sessions.find((s) => s.id === sessionId);
  if (!current) return [];

  const classIds = ((session.schedule_session_targets ?? []) as { class_id: string | null }[])
    .map((t) => t.class_id)
    .filter((c): c is string => !!c);

  // Les creneaux de LA grille de cette classe, pas de toutes les grilles de
  // l'ecole : un college et un lycee n'ont ni les memes heures ni les memes
  // recreations, et proposer de deplacer une 6eme sur un creneau de Terminale
  // n'aurait aucun sens.
  const config = classIds[0]
    ? await getConfigForClass(ctx, session.academic_year_id, classIds[0])
    : await getConfig(ctx, session.academic_year_id);
  const slotRows = config ? await listSlots(ctx, config.id) : [];

  const scope: CourseScope = {
    subjectId: session.subject_id,
    classIds,
    levelIds: [],
    teacherIds: current.teacherIds,
  };
  const hard = rules
    .filter((r) => r.enabled && r.severity === 'HARD')
    .map((r) => ({ code: r.code, scopeType: r.scopeType, scopeId: r.scopeId, params: r.params, summary: r.summary }));

  // La grille renvoie du snake_case ; le validateur raisonne en camelCase.
  const choices: SlotChoice[] = slotRows.map(
    (r) => ({ id: r.id, dayOfWeek: r.day_of_week, startsAt: r.starts_at.slice(0, 5), endsAt: r.ends_at.slice(0, 5) }),
  );

  return choices.map((slot) => {
    const isCurrent = slot.id === session.start_slot_id;
    const reasons = isCurrent ? [] : moveProblems(sessions, sessionId, slot, scope, hard);
    return { slot, ok: reasons.length === 0, reasons, current: isCurrent };
  });
}

/**
 * Applique le déplacement, après le même contrôle.
 *
 * Le contrôle est refait ici : l'écran a pu être ouvert depuis dix minutes, et
 * un autre utilisateur a pu occuper le créneau entre-temps.
 */
export async function moveSession(
  ctx: TenantContext,
  versionId: string,
  sessionId: string,
  slotId: string,
): Promise<void> {
  requireWritable(ctx, 'schedule.update');
  const options = await moveOptions(ctx, versionId, sessionId);
  const chosen = options.find((o) => o.slot.id === slotId);
  if (!chosen) throw new ValidationError('Ce créneau n’appartient pas à la grille horaire.');
  if (!chosen.ok) throw new ValidationError(chosen.reasons.join(' '));

  const supabase = await createClient();
  const { error, count } = await supabase
    .from('schedule_sessions')
    .update(
      {
        day_of_week: chosen.slot.dayOfWeek,
        start_slot_id: chosen.slot.id,
        end_slot_id: chosen.slot.id,
        starts_at: chosen.slot.startsAt,
        ends_at: chosen.slot.endsAt,
      },
      { count: 'exact' },
    )
    .eq('school_id', ctx.school.id)
    .eq('id', sessionId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Séance introuvable.');

  await audit(ctx, {
    action: 'schedule.session_move',
    module: 'schedule',
    entityType: 'schedule_session',
    entityId: sessionId,
    after: { slotId, day: chosen.slot.dayOfWeek, from: chosen.slot.startsAt },
  });
}
