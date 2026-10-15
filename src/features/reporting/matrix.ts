import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { gradingParams, rpcArgs, subjectArgs } from '@/features/evaluations/scale';
import { getMyTeacherId } from '@/features/schedule/my-schedule';
import { rankWithTies, type Matrix, type MatrixRow, type MatrixSubject } from './matrix-core';

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
export async function buildMatrix(ctx: TenantContext, classId: string, periodId: string): Promise<Matrix> {
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

  const { data: ranking, error: rankErr } = await supabase.rpc('class_period_ranking' as never, {
    p_class: classId,
    p_period: periodId,
    ...rpcArgs(params),
  } as never);
  if (rankErr) throw new Error(`Moyennes générales impossibles : ${rankErr.message}`);
  const general = new Map(
    ((ranking ?? []) as { student_id: string; general_average: number | string | null; rank_position: number | null }[]).map(
      (r) => [r.student_id, { average: r.general_average === null ? null : Number(r.general_average), rank: r.rank_position }],
    ),
  );
  const generalTies = rankWithTies(students.map((s) => general.get(s.id)?.average ?? null));

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
      general: { average: general.get(st.id)?.average ?? null, ...generalTies[i]! },
      recalls: [],
      annual: null,
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
    recallLabels: [],
    hasAnnual: false,
  };
}
