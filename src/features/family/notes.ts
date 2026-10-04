import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { listPeriods, type PeriodRow } from '@/features/academic-years/queries';
import { periodsForTrack } from '@/features/academic-years/periods-by-track';
import { classTrack } from '@/features/evaluations/refs';
import { gradingParams, rpcArgs, subjectArgs } from '@/features/evaluations/scale';
import { pickPeriod } from './periods';
import type { Child } from './children';

/**
 * Les notes d'un enfant, pour ses parents.
 *
 * Trois choses a savoir sur ce que cette page montre, et qu'elle annonce aussi
 * a l'ecran :
 *
 * 1. Uniquement les evaluations PUBLIEES. Ce n'est pas un filtre de confort :
 *    la RLS de `grades` (0021/0029) ne laisse rien d'autre passer a un parent,
 *    qui ne porte aucune permission (0028). Le filtre explicite ci-dessous dit
 *    la meme chose a voix haute, et protege la page le jour ou quelqu'un
 *    cumulerait parent et enseignant.
 * 2. Les moyennes ne sont pas calculees ici. Elles viennent des fonctions SQL
 *    (0038, 0098) qui servent deja au bulletin et au classement : une moyenne
 *    recalculee en TypeScript finirait par ne plus dire la meme chose.
 * 3. Le decoupage suit l'enfant. Trimestres pour le general, semestres pour le
 *    technique et le professionnel : les periodes proposees sont celles de
 *    l'ordre de SA classe (periodsForTrack).
 */

export type ChildGrade = {
  id: string;
  title: string;
  date: string | null;
  score: number | null;
  max: number;
  coefficient: number;
  isAbsent: boolean;
  isExcused: boolean;
  /** Note explicitement retiree de la moyenne par l'enseignant. */
  excluded: boolean;
  comment: string | null;
};

export type SubjectBlock = {
  subjectId: string;
  subject: string;
  average: number | null;
  grades: ChildGrade[];
};

export type ChildNotes = {
  /** Les periodes de l'ordre d'enseignement de l'enfant, dans l'ordre. */
  periods: PeriodRow[];
  period: PeriodRow | null;
  subjects: SubjectBlock[];
  /** Moyenne generale de la periode, sur les notes publiees. */
  periodAverage: number | null;
  scaleMax: number;
  decimals: number;
};

const VIDE = (periods: PeriodRow[], period: PeriodRow | null, scaleMax: number, decimals: number): ChildNotes => ({
  periods,
  period,
  subjects: [],
  periodAverage: null,
  scaleMax,
  decimals,
});

export async function loadChildNotes(
  ctx: TenantContext,
  child: Child,
  wantedPeriod: string | undefined,
): Promise<ChildNotes> {
  const yearId = ctx.academicYear?.id ?? null;
  const params = await gradingParams(ctx);
  if (!yearId) return VIDE([], null, params.scaleMax, params.decimals);

  const track = child.classId ? await classTrack(ctx, child.classId) : 'GENERAL';
  const periods = periodsForTrack(await listPeriods(ctx, yearId), track).filter((p) => p.is_grading_period);
  const period = pickPeriod(periods, wantedPeriod, new Date().toISOString().slice(0, 10));
  if (!period) return VIDE(periods, null, params.scaleMax, params.decimals);

  const supabase = await createClient();
  const [{ data: gradeRows }, { data: subjectAverages }, { data: periodAverage }] = await Promise.all([
    supabase
      .from('grades')
      .select(
        'id, score, is_absent, is_excused, is_excluded_from_average, comment, ' +
          'assessments!inner(title, assessment_date, max_score, coefficient, status, academic_period_id, subject_id, subjects(name))',
      )
      .eq('school_id', ctx.school.id)
      .eq('student_id', child.id)
      .eq('assessments.academic_period_id', period.id)
      .eq('assessments.status', 'PUBLISHED'),
    // Une seule requete pour toutes les matieres (0098), plutot qu'une par
    // matiere. Si la migration n'est pas encore appliquee, l'appel repond en
    // erreur sans lever : les notes restent affichees, les moyennes sur « — ».
    supabase.rpc('student_period_subject_averages' as never, {
      p_student: child.id,
      p_period: period.id,
      ...subjectArgs(params),
    } as never),
    supabase.rpc('student_period_average' as never, {
      p_student: child.id,
      p_period: period.id,
      ...rpcArgs(params),
    } as never),
  ]);

  const moyenneParMatiere = new Map(
    ((subjectAverages ?? []) as unknown as { subject_id: string; average: number | null }[]).map((r) => [
      r.subject_id,
      r.average === null ? null : Number(r.average),
    ]),
  );

  const blocs = new Map<string, SubjectBlock>();
  for (const g of (gradeRows ?? []) as unknown as {
    id: string;
    score: number | null;
    is_absent: boolean;
    is_excused: boolean;
    is_excluded_from_average: boolean;
    comment: string | null;
    assessments: {
      title: string;
      assessment_date: string | null;
      max_score: number;
      coefficient: number;
      subject_id: string;
      subjects: { name: string } | null;
    } | null;
  }[]) {
    const a = g.assessments;
    if (!a) continue;
    const bloc = blocs.get(a.subject_id) ?? {
      subjectId: a.subject_id,
      subject: a.subjects?.name ?? 'Matière',
      average: moyenneParMatiere.get(a.subject_id) ?? null,
      grades: [],
    };
    bloc.grades.push({
      id: g.id,
      title: a.title,
      date: a.assessment_date,
      score: g.score === null ? null : Number(g.score),
      max: Number(a.max_score),
      coefficient: Number(a.coefficient),
      isAbsent: g.is_absent,
      isExcused: g.is_excused,
      excluded: g.is_excluded_from_average,
      comment: g.comment,
    });
    blocs.set(a.subject_id, bloc);
  }

  const subjects = [...blocs.values()]
    .map((b) => ({
      ...b,
      // La plus recente en premier ; une evaluation sans date ferme la marche.
      grades: b.grades.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'fr'));

  return {
    periods,
    period,
    subjects,
    periodAverage: periodAverage === null || periodAverage === undefined ? null : Number(periodAverage),
    scaleMax: params.scaleMax,
    decimals: params.decimals,
  };
}
