import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Moyenne et classement d'UNE matiere sur une classe, calcules A TOUT MOMENT
 * (§3.6) : contrairement au classement general des bulletins
 * (class_period_ranking, reserve a la direction et aux evaluations
 * cloturees/publiees), ce calcul inclut aussi les evaluations en brouillon —
 * la cloture reste un geste de l'administration qui gele la saisie, elle ne
 * conditionne plus ce calcul de travail. S'appuie sur
 * app.class_subject_averages(..., p_include_draft => true), migration 0038 :
 * meme formule que partout ailleurs (note ramenee sur 20, ponderee par
 * coefficient), une seule verite de calcul.
 */

export type LiveRankingRow = {
  studentId: string;
  matricule: string;
  name: string;
  scores: (number | null)[];
  average: number | null;
  rank: number | null;
};

export type LiveRanking = {
  assessments: { id: string; title: string; maxScore: number }[];
  rows: LiveRankingRow[];
};

export async function computeLiveRanking(
  ctx: TenantContext,
  classId: string,
  periodId: string,
  subjectId: string,
): Promise<LiveRanking> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;

  const [{ data: assessRows }, { data: enrRows }, { data: avgRows }] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, title, max_score')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('academic_period_id', periodId)
      .eq('subject_id', subjectId)
      .order('assessment_date'),
    supabase
      .from('student_enrollments')
      .select('student_id, students(matricule, first_name, last_name)')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('status', 'ENROLLED'),
    supabase.rpc('class_subject_averages' as never, {
      p_class: classId,
      p_period: periodId,
      p_subject: subjectId,
      p_include_draft: true,
    } as never),
  ]);

  const assessments = ((assessRows ?? []) as { id: string; title: string; max_score: number }[]).map((a) => ({
    id: a.id,
    title: a.title,
    maxScore: Number(a.max_score),
  }));

  const students = (enrRows ?? []) as unknown as {
    student_id: string;
    students: { matricule: string; first_name: string; last_name: string } | null;
  }[];

  const gradesByStudent = new Map<string, Map<string, number | null>>();
  if (assessments.length > 0 && students.length > 0) {
    const { data: gradeRows } = await supabase
      .from('grades')
      .select('assessment_id, student_id, score, is_absent')
      .eq('school_id', schoolId)
      .in(
        'assessment_id',
        assessments.map((a) => a.id),
      );
    for (const g of (gradeRows ?? []) as { assessment_id: string; student_id: string; score: number | null; is_absent: boolean }[]) {
      const m = gradesByStudent.get(g.student_id) ?? new Map<string, number | null>();
      m.set(g.assessment_id, g.is_absent ? null : g.score !== null ? Number(g.score) : null);
      gradesByStudent.set(g.student_id, m);
    }
  }

  const averageByStudent = new Map<string, number | null>();
  for (const r of (avgRows ?? []) as unknown as { student_id: string; average: number | null }[]) {
    averageByStudent.set(r.student_id, r.average === null ? null : Number(r.average));
  }

  // Rang ex aequo (meme convention que app.class_period_ranking : rank(), pas dense_rank()).
  const withAverage = students
    .map((s) => ({ studentId: s.student_id, average: averageByStudent.get(s.student_id) ?? null }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const rankByStudent = new Map<string, number | null>();
  withAverage.forEach((s, i) => {
    if (s.average === null) {
      rankByStudent.set(s.studentId, null);
      return;
    }
    const prev = i > 0 ? withAverage[i - 1]! : null;
    const prevRank = prev && prev.average !== null ? rankByStudent.get(prev.studentId) : null;
    rankByStudent.set(s.studentId, prev && prev.average === s.average ? (prevRank ?? i + 1) : i + 1);
  });

  const rows: LiveRankingRow[] = students
    .map((s) => {
      const g = gradesByStudent.get(s.student_id);
      return {
        studentId: s.student_id,
        matricule: s.students?.matricule ?? '',
        name: s.students ? `${s.students.last_name.toUpperCase()} ${s.students.first_name}` : '—',
        scores: assessments.map((a) => g?.get(a.id) ?? null),
        average: averageByStudent.get(s.student_id) ?? null,
        rank: rankByStudent.get(s.student_id) ?? null,
      };
    })
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));

  return { assessments, rows };
}
