import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { gradingParams, rpcArgs, subjectArgs } from '@/features/evaluations/scale';
import { getMyTeacherId } from '@/features/schedule/my-schedule';
import { rankWithTies, type Matrix, type MatrixRow, type MatrixSubject } from './matrix-core';
import { councilAveragesFor } from './council';
import { classTrack } from '@/features/evaluations/refs';
import { listGradingPeriods, isLastPeriod, periodsBefore } from './periods';
import { readReportingSettings } from './settings';
import { weightOf } from './config';
import { rounder } from './annual';
import { annualFrom, periodValue } from './annual-core';
import { previousSchoolAverages } from './previous-school';

/**
 * Qui tire la matrice d'une classe : le droit « Tirer les matrices »
 * (direction, informaticien…), ou le professeur principal de CETTE classe.
 */
export async function canSeeMatrix(ctx: TenantContext, classId: string): Promise<boolean> {
  if (hasPermission(ctx, 'reports.matrix')) return true;
  return isHeadTeacherOf(ctx, classId);
}

export async function isHeadTeacherOf(ctx: TenantContext, classId: string): Promise<boolean> {
  const teacherId = await getMyTeacherId(ctx);
  if (!teacherId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .eq('head_teacher_id', teacherId)
    .maybeSingle();
  return Boolean(data);
}

/** Les classes dont l'utilisateur est le professeur principal, cette année. */
export async function myHeadClasses(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  if (!ctx.academicYear) return [];
  const teacherId = await getMyTeacherId(ctx);
  if (!teacherId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', ctx.academicYear.id)
    .eq('head_teacher_id', teacherId)
    .eq('status', 'ACTIVE')
    .order('name');
  return (data ?? []) as { id: string; name: string }[];
}

/**
 * L'ordre habituel d'un bulletin ivoirien : lettres, langues, sciences humaines,
 * sciences, puis les autres, la conduite en dernier. Une matière inconnue
 * se range avant la conduite, par ordre alphabétique.
 */
const SUBJECT_ORDER = ['FR', 'ANG', 'LV2', 'HG', 'PHILO', 'EDHC', 'MATH', 'PC', 'SVT', 'TICE', 'ARTS', 'EPS'];
function subjectOrder(s: { code: string | null } | null): number {
  const code = (s?.code ?? '').toUpperCase();
  if (code === 'COND') return 1000;
  const i = SUBJECT_ORDER.indexOf(code);
  return i === -1 ? 500 : i;
}

/**
 * La matrice d'une classe pour une période, calculée par les MÊMES fonctions
 * que les bulletins (barème, arrondi, notes en direct, matières facultatives) :
 * ce que le professeur principal vérifie est ce qui sera imprimé.
 */
export async function buildMatrix(
  ctx: TenantContext,
  classId: string,
  periodId: string,
  options: { council?: boolean } = {},
): Promise<Matrix> {
  if (!(await canSeeMatrix(ctx, classId))) {
    throw new AuthorizationError('La matrice de cette classe est réservée à son professeur principal et à la direction.');
  }
  const supabase = await createClient();

  const [{ data: klass }, { data: period }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, level_id, teachers:head_teacher_id(first_name, last_name, gender)')
      .eq('school_id', ctx.school.id)
      .eq('id', classId)
      .maybeSingle(),
    supabase.from('academic_periods').select('id, name').eq('school_id', ctx.school.id).eq('id', periodId).maybeSingle(),
  ]);
  if (!klass || !period) throw new NotFoundError('Classe ou période introuvable.');
  const k = klass as unknown as {
    id: string;
    name: string;
    level_id: string;
    teachers: { first_name: string; last_name: string; gender: string | null } | null;
  };

  // Programme du niveau, dans l'ordre où il a été saisi (celui de la grille officielle).
  const [{ data: programme }, { data: enr }, { data: exemptRows }] = await Promise.all([
    supabase
      .from('level_subjects')
      .select('subject_id, coefficient, created_at, subjects(code, name, short_name)')
      .eq('school_id', ctx.school.id)
      .eq('level_id', k.level_id)
      .order('created_at'),
    supabase
      .from('student_enrollments')
      .select('student_id, students(first_name, last_name, gender)')
      .eq('school_id', ctx.school.id)
      .eq('class_id', classId)
      .eq('status', 'ENROLLED'),
    supabase
      .from('subject_exemptions')
      .select('student_id, subject_id')
      .eq('school_id', ctx.school.id)
      .eq('academic_period_id', periodId),
  ]);
  const exempt = new Set((exemptRows ?? []).map((r) => `${r.student_id}:${r.subject_id}`));

  const students = ((enr ?? []) as unknown as {
    student_id: string;
    students: { first_name: string; last_name: string; gender: string | null } | null;
  }[])
    .map((e) => ({
      id: e.student_id,
      name: e.students ? `${e.students.last_name.toUpperCase()} ${e.students.first_name}` : '—',
      female: e.students?.gender === 'F',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const params = await gradingParams(ctx);
  const subjects: MatrixSubject[] = [];
  const bySubject = new Map<string, Map<string, number | null>>();
  type ProgRow = { subject_id: string; coefficient: number; subjects: { code: string | null; name: string; short_name: string | null } | null };
  const ordered = [...((programme ?? []) as unknown as ProgRow[])].sort(
    (a, b) => subjectOrder(a.subjects) - subjectOrder(b.subjects) || (a.subjects?.name ?? '').localeCompare(b.subjects?.name ?? '', 'fr'),
  );
  for (const r of ordered) {
    const { data: rows, error } = await supabase.rpc('class_subject_averages' as never, {
      p_class: classId,
      p_period: periodId,
      p_subject: r.subject_id,
      ...subjectArgs(params),
    } as never);
    if (error) throw new Error(`Moyennes de « ${r.subjects?.name ?? 'matière'} » impossibles : ${error.message}`);
    const avg = new Map(
      ((rows ?? []) as { student_id: string; average: number | string | null }[]).map((x) => [
        x.student_id,
        x.average === null ? null : Number(x.average),
      ]),
    );
    bySubject.set(r.subject_id, avg);
    const values = students.map((s) => avg.get(s.id) ?? null).filter((v): v is number => v !== null);
    subjects.push({
      id: r.subject_id,
      name: r.subjects?.short_name || r.subjects?.name || 'Matière',
      coefficient: Number(r.coefficient),
      classAverage: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
    });
  }

  // Moyenne générale d'une période, telle qu'elle est (ou sera) imprimée :
  // calculée, remplacée par la moyenne retenue du conseil s'il y en a une.
  const ids = students.map((s) => s.id);
  async function generalOf(pid: string, fromBulletins: boolean): Promise<(number | null)[]> {
    const [{ data: ranking, error }, retained] = await Promise.all([
      supabase.rpc('class_period_ranking' as never, { p_class: classId, p_period: pid, ...rpcArgs(params) } as never),
      councilAveragesFor(ctx, ids, pid),
    ]);
    if (error) throw new Error(`Moyennes générales impossibles : ${error.message}`);
    const live = new Map(
      ((ranking ?? []) as { student_id: string; general_average: number | string | null }[]).map((r) => [
        r.student_id,
        r.general_average === null ? null : Number(r.general_average),
      ]),
    );
    // Période passée : la moyenne IMPRIMÉE sur le bulletin fait foi (un élève
    // arrivé d'une autre classe garde la sienne) ; sinon le calcul en direct.
    const printed = new Map<string, number | null>();
    if (fromBulletins) {
      const { data: cards } = await supabase
        .from('report_cards')
        .select('student_id, general_average')
        .eq('school_id', ctx.school.id)
        .eq('academic_period_id', pid)
        .in('student_id', ids);
      for (const c of (cards ?? []) as { student_id: string; general_average: number | string | null }[]) {
        printed.set(c.student_id, c.general_average === null ? null : Number(c.general_average));
      }
    }
    return ids.map((id) => (retained.has(id) ? retained.get(id)! : printed.has(id) ? printed.get(id)! : (live.get(id) ?? null)));
  }

  const current = await generalOf(periodId, false);
  const generalTies = rankWithTies(current);

  // Matrice du conseil : rappel des périodes précédentes, et moyenne annuelle
  // sur la dernière période de l'année (mêmes coefficients que le bulletin).
  let recallLabels: string[] = [];
  let recallValues: (number | null)[][] = [];
  let annualValues: (number | null)[] | null = null;
  let recallPeriodIds: string[] = [];
  let newcomerMode: 'ATTENDED' | 'PREVIOUS_SCHOOL' = 'ATTENDED';
  let recallSources: ('OURS' | 'PREVIOUS_SCHOOL' | 'NONE')[][] = [];
  if (options.council && ctx.academicYear) {
    const [track, periods, reporting] = await Promise.all([
      classTrack(ctx, classId),
      listGradingPeriods(ctx, ctx.academicYear.id),
      readReportingSettings(ctx),
    ]);
    const before = periodsBefore(periods, track, periodId);
    recallLabels = before.map((p) => p.name);
    const ours = await Promise.all(before.map((p) => generalOf(p.id, true)));
    // Élève arrivé en cours d'année (0114) : selon le choix de l'établissement,
    // la période manquante prend la moyenne de son ancienne école, ou reste vide.
    const external =
      reporting.newcomerAnnual === 'PREVIOUS_SCHOOL'
        ? await previousSchoolAverages(ctx, ids, before.map((p) => p.id))
        : new Map<string, { average: number; school: string | null }>();
    const parts = (i: number) =>
      before.map((p, k) => ({
        value: ours[k]![i] ?? null,
        previousSchool: external.get(`${ids[i]}:${p.id}`)?.average ?? null,
        weight: weightOf(reporting.periodWeights, p.sequence),
      }));
    recallValues = before.map((_, k) => ids.map((__, i) => periodValue(parts(i)[k]!, reporting.newcomerAnnual)));
    recallPeriodIds = before.map((p) => p.id);
    newcomerMode = reporting.newcomerAnnual;
    // « Arrivé en cours d'année » pour une période : inscrit dans l'établissement
    // APRÈS son début. Un élève présent dès la rentrée sans note n'en est pas un.
    const { data: enrolments } = await supabase
      .from('student_enrollments')
      .select('student_id, enrolled_on')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', ctx.academicYear.id)
      .in('student_id', ids);
    const arrived = new Map<string, string>();
    for (const e of (enrolments ?? []) as { student_id: string; enrolled_on: string | null }[]) {
      if (!e.enrolled_on) continue;
      const prev = arrived.get(e.student_id);
      if (!prev || e.enrolled_on < prev) arrived.set(e.student_id, e.enrolled_on);
    }
    recallSources = ids.map((id, i) =>
      parts(i).map((pt, k) => {
        if (pt.value !== null) return 'OURS';
        const came = arrived.get(id);
        if (!came || came <= before[k]!.startsOn) return 'OURS'; // présent dès le début : pas un nouvel arrivant
        return pt.previousSchool !== null ? 'PREVIOUS_SCHOOL' : 'NONE';
      }),
    );
    if (isLastPeriod(periods, track, periodId)) {
      const round = rounder(params.decimals, params.rounding);
      const seq = periods.find((p) => p.id === periodId)?.sequence ?? before.length + 1;
      annualValues = ids.map((_, i) =>
        annualFrom(parts(i), { value: current[i] ?? null, weight: weightOf(reporting.periodWeights, seq) }, reporting.newcomerAnnual, round),
      );
    }
  }
  const recallTies = recallValues.map((vals) => rankWithTies(vals));
  const annualTies = annualValues ? rankWithTies(annualValues) : null;

  const subjectRanks = new Map(
    subjects.map((s) => [s.id, rankWithTies(students.map((st) => (exempt.has(`${st.id}:${s.id}`) ? null : (bySubject.get(s.id)?.get(st.id) ?? null))))]),
  );

  const rows: MatrixRow[] = students.map((st, i) => {
    const cells: MatrixRow['cells'] = {};
    for (const s of subjects) {
      const isExempt = exempt.has(`${st.id}:${s.id}`);
      const r = subjectRanks.get(s.id)![i]!;
      cells[s.id] = {
        average: isExempt ? null : (bySubject.get(s.id)?.get(st.id) ?? null),
        rank: isExempt ? null : r.rank,
        exAequo: !isExempt && r.exAequo,
        exempt: isExempt,
      };
    }
    return {
      studentId: st.id,
      name: st.name,
      female: st.female,
      cells,
      general: { average: current[i] ?? null, ...generalTies[i]! },
      recalls: recallValues.map((vals, k) => ({ average: vals[i] ?? null, ...recallTies[k]![i]! })),
      annual: annualValues && annualTies ? { average: annualValues[i] ?? null, ...annualTies[i]! } : null,
      ...(recallSources[i] ? { recallSources: recallSources[i] } : {}),
    };
  });

  const head = k.teachers;
  return {
    className: k.name,
    periodName: (period as { name: string }).name,
    schoolName: ctx.school.name,
    yearName: ctx.academicYear?.name ?? '',
    headTeacher: head ? `${head.gender === 'F' ? 'Mme' : 'M.'} ${head.last_name.toUpperCase()} ${head.first_name}` : null,
    subjects,
    rows,
    recallLabels,
    recallPeriodIds,
    newcomerMode,
    hasAnnual: annualValues !== null,
  };
}
