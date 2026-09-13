import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Consolidation ANNUELLE d'une matiere (§3.7) : PAS une copie d'une periode,
 * mais la moyenne ponderee des moyennes de chaque periode de notation de
 * l'annee, en francs... pardon, en points sur 20, ponderee par
 * academic_periods.weight — le champ existait deja (migration 0008) mais
 * n'etait encore utilise nulle part : c'est exactement sa raison d'etre
 * (poids relatif d'un trimestre/semestre dans le calcul annuel, reglable par
 * etablissement plutot que fige a « un tiers chacun »).
 */

export type AnnualRow = {
  studentId: string;
  matricule: string;
  name: string;
  periodAverages: (number | null)[];
  annualAverage: number | null;
  rank: number | null;
};

export type AnnualResult = {
  periods: { id: string; name: string }[];
  rows: AnnualRow[];
};

export async function computeAnnualConsolidation(
  ctx: TenantContext,
  classId: string,
  subjectId: string,
): Promise<AnnualResult> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id;
  if (!yearId) return { periods: [], rows: [] };

  const { data: periodRows } = await supabase
    .from('academic_periods')
    .select('id, name, weight, sequence')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  const periods = ((periodRows ?? []) as { id: string; name: string; weight: number }[]).map((p) => ({
    id: p.id,
    name: p.name,
    weight: Number(p.weight),
  }));
  if (periods.length === 0) return { periods: [], rows: [] };

  const { data: enrRows } = await supabase
    .from('student_enrollments')
    .select('student_id, students(matricule, first_name, last_name)')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('status', 'ENROLLED');
  const students = (enrRows ?? []) as unknown as {
    student_id: string;
    students: { matricule: string; first_name: string; last_name: string } | null;
  }[];

  const perPeriodAverages = await Promise.all(
    periods.map((p) =>
      supabase.rpc('class_subject_averages' as never, {
        p_class: classId,
        p_period: p.id,
        p_subject: subjectId,
        p_include_draft: true,
      } as never),
    ),
  );
  const maps = perPeriodAverages.map(
    (res) => new Map(((res.data ?? []) as unknown as { student_id: string; average: number | null }[]).map((r) => [r.student_id, r.average])),
  );

  const rowsUnranked = students.map((s) => {
    const periodAverages = maps.map((m) => {
      const v = m.get(s.student_id);
      return v === null || v === undefined ? null : Number(v);
    });
    let sumWeight = 0;
    let sumWeighted = 0;
    periods.forEach((p, i) => {
      const v = periodAverages[i];
      if (v !== null && v !== undefined) {
        sumWeight += p.weight;
        sumWeighted += v * p.weight;
      }
    });
    const annualAverage = sumWeight > 0 ? Math.round((sumWeighted / sumWeight) * 100) / 100 : null;
    return {
      studentId: s.student_id,
      matricule: s.students?.matricule ?? '',
      name: s.students ? `${s.students.last_name.toUpperCase()} ${s.students.first_name}` : '—',
      periodAverages,
      annualAverage,
    };
  });

  const sorted = [...rowsUnranked].sort((a, b) => (b.annualAverage ?? -1) - (a.annualAverage ?? -1));
  const rankByStudent = new Map<string, number | null>();
  sorted.forEach((s, i) => {
    if (s.annualAverage === null) {
      rankByStudent.set(s.studentId, null);
      return;
    }
    const prev = i > 0 ? sorted[i - 1]! : null;
    const prevRank = prev && prev.annualAverage !== null ? rankByStudent.get(prev.studentId) : null;
    rankByStudent.set(s.studentId, prev && prev.annualAverage === s.annualAverage ? (prevRank ?? i + 1) : i + 1);
  });

  const rows: AnnualRow[] = rowsUnranked
    .map((r) => ({ ...r, rank: rankByStudent.get(r.studentId) ?? null }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));

  return { periods: periods.map((p) => ({ id: p.id, name: p.name })), rows };
}
