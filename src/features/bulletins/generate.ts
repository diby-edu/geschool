import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';

export type GenerateResult = { generated: number };

/**
 * Génère (ou régénère) les bulletins d'une classe pour une période.
 *
 * Tout est calculé à partir des notes clôturées/publiées (fonctions SQL 0022 /
 * 0037), puis FIGÉ dans report_cards + report_card_items : le bulletin est un
 * instantané qui survit au renommage d'une matière ou au départ d'un enseignant
 * (docs/DATABASE.md §23). Régénérer un bulletin VALIDÉ ou PUBLIÉ est refusé.
 */
export async function generateForClass(ctx: TenantContext, classId: string, periodId: string): Promise<GenerateResult> {
  requireWritable(ctx, 'reports.generate');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;

  const { data: klass } = await supabase
    .from('classes')
    .select('id, name, level_id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!klass) throw new NotFoundError('Classe introuvable.');

  const { data: period } = await supabase
    .from('academic_periods')
    .select('id, starts_on, ends_on')
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .maybeSingle();
  if (!period) throw new NotFoundError('Période introuvable.');

  // Refuser de régénérer par-dessus des bulletins déjà validés/publiés.
  const { data: locked } = await supabase
    .from('report_cards')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('academic_period_id', periodId)
    .eq('class_id', classId)
    .in('status', ['VALIDATED', 'PUBLISHED'])
    .limit(1);
  if (locked && locked.length > 0) {
    throw new ValidationError('Des bulletins de cette classe sont déjà validés ou publiés. Impossible de régénérer.');
  }

  // Programme de la classe : matières + coefficients du niveau.
  const { data: ls } = await supabase
    .from('level_subjects')
    .select('subject_id, coefficient, subjects(name)')
    .eq('school_id', ctx.school.id)
    .eq('level_id', klass.level_id);
  const subjects = ((ls ?? []) as unknown as { subject_id: string; coefficient: number; subjects: { name: string } | null }[])
    .map((r) => ({ id: r.subject_id, coefficient: Number(r.coefficient), name: r.subjects?.name ?? 'Matière' }));

  // Élèves inscrits.
  const { data: enr } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('status', 'ENROLLED');
  const studentIds = (enr ?? []).map((e) => e.student_id);
  if (studentIds.length === 0) throw new ValidationError('Aucun élève inscrit dans cette classe.');

  // Classement général (moyenne générale, rang, effectif).
  const { data: rankData } = await supabase.rpc('class_period_ranking' as never, { p_class: classId, p_period: periodId } as never);
  const ranking = new Map(
    ((rankData ?? []) as unknown as { student_id: string; general_average: number | null; rank_position: number | null; class_size: number }[])
      .map((r) => [r.student_id, r]),
  );
  const generalAverages = [...ranking.values()].map((r) => r.general_average).filter((a): a is number => a !== null).map(Number);
  const classGeneralAvg = generalAverages.length > 0 ? round2(generalAverages.reduce((a, b) => a + b, 0) / generalAverages.length) : null;
  const classSize = [...ranking.values()][0]?.class_size ?? studentIds.length;

  // Moyennes par matière pour toute la classe (une requête par matière).
  type SubjStat = { average: Map<string, number | null>; classAvg: number | null; min: number | null; max: number | null; rank: Map<string, number> };
  const subjStats = new Map<string, SubjStat>();
  for (const s of subjects) {
    const { data: rows } = await supabase.rpc('class_subject_averages' as never, { p_class: classId, p_period: periodId, p_subject: s.id } as never);
    const list = ((rows ?? []) as unknown as { student_id: string; average: number | null }[]).map((r) => ({ student_id: r.student_id, average: r.average === null ? null : Number(r.average) }));
    const avgMap = new Map(list.map((r) => [r.student_id, r.average]));
    const values = list.map((r) => r.average).filter((a): a is number => a !== null);
    const classAvg = values.length > 0 ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null;
    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 0 ? Math.max(...values) : null;
    // Rang par matière (ex æquo usuel).
    const sorted = [...list].filter((r) => r.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
    const rankMap = new Map<string, number>();
    sorted.forEach((r, i) => {
      const prev = i > 0 ? sorted[i - 1]! : null;
      rankMap.set(r.student_id, prev && prev.average === r.average ? rankMap.get(prev.student_id)! : i + 1);
    });
    subjStats.set(s.id, { average: avgMap, classAvg, min, max, rank: rankMap });
  }

  // Absences / retards de la période (une requête, tally en mémoire).
  const { absences, lateness } = await countAttendance(ctx, studentIds, period.starts_on, period.ends_on);

  // Snapshot par élève.
  let generated = 0;
  for (const studentId of studentIds) {
    const r = ranking.get(studentId);
    const { data: card, error: cardErr } = await supabase
      .from('report_cards')
      .upsert(
        {
          school_id: ctx.school.id,
          academic_year_id: yearId,
          academic_period_id: periodId,
          student_id: studentId,
          class_id: classId,
          status: 'GENERATED',
          general_average: r?.general_average ?? null,
          rank: r?.rank_position ?? null,
          class_size: classSize,
          class_average: classGeneralAvg,
          absences_count: absences.get(studentId) ?? 0,
          lateness_count: lateness.get(studentId) ?? 0,
          generated_at: new Date().toISOString(),
        } satisfies TablesInsert<'report_cards'>,
        { onConflict: 'student_id,academic_period_id' },
      )
      .select('id')
      .single();
    if (cardErr) throw cardErr;

    // Remplacer les lignes de matière.
    await supabase.from('report_card_items').delete().eq('school_id', ctx.school.id).eq('report_card_id', card.id);
    const items: TablesInsert<'report_card_items'>[] = subjects.map((s, i) => {
      const st = subjStats.get(s.id)!;
      const avg = st.average.get(studentId) ?? null;
      return {
        school_id: ctx.school.id,
        report_card_id: card.id,
        subject_id: s.id,
        subject_name_snapshot: s.name,
        coefficient: s.coefficient,
        average: avg,
        weighted_points: avg !== null ? round2(avg * s.coefficient) : null,
        class_average: st.classAvg,
        class_min: st.min,
        class_max: st.max,
        rank: st.rank.get(studentId) ?? null,
        sequence: i,
      };
    });
    if (items.length > 0) await supabase.from('report_card_items').insert(items);
    generated++;
  }

  await audit(ctx, { action: 'reports.generate', module: 'reports', entityType: 'report_card', after: { classId, periodId, generated } });
  return { generated };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function countAttendance(
  ctx: TenantContext,
  studentIds: string[],
  from: string,
  to: string,
): Promise<{ absences: Map<string, number>; lateness: Map<string, number> }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('attendance_records')
    .select('student_id, status, attendance_registers(session_occurrences(occurs_on))')
    .eq('school_id', ctx.school.id)
    .in('status', ['ABSENT', 'LATE'])
    .in('student_id', studentIds);

  const absences = new Map<string, number>();
  const lateness = new Map<string, number>();
  for (const r of (data ?? []) as unknown as {
    student_id: string;
    status: string;
    attendance_registers: { session_occurrences: { occurs_on: string } | null } | null;
  }[]) {
    const date = r.attendance_registers?.session_occurrences?.occurs_on;
    if (!date || date < from || date > to) continue;
    const target = r.status === 'ABSENT' ? absences : lateness;
    target.set(r.student_id, (target.get(r.student_id) ?? 0) + 1);
  }
  return { absences, lateness };
}
