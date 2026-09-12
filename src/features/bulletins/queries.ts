import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { BulletinRow, BulletinDetail } from './types';

export { BULLETIN_STATUS } from './types';
export type { BulletinRow, BulletinItem, BulletinDetail } from './types';

export async function listBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<BulletinRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select('id, general_average, rank, status, students(matricule, first_name, last_name)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId);
  return ((data ?? []) as unknown as {
    id: string;
    general_average: number | null;
    rank: number | null;
    status: string;
    students: { matricule: string; first_name: string; last_name: string } | null;
  }[])
    .map((r) => ({
      id: r.id,
      student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
      matricule: r.students?.matricule ?? '',
      general_average: r.general_average === null ? null : Number(r.general_average),
      rank: r.rank,
      status: r.status,
    }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.student.localeCompare(b.student));
}

export async function getBulletin(ctx: TenantContext, id: string): Promise<BulletinDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select(
      'id, status, general_average, rank, class_size, class_average, absences_count, lateness_count, head_teacher_comment, ' +
        'students(matricule, first_name, last_name), classes(name), academic_periods(name), ' +
        'report_card_items(subject_name_snapshot, coefficient, average, weighted_points, class_average, class_min, class_max, rank, sequence)',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as {
    id: string;
    status: string;
    general_average: number | null;
    rank: number | null;
    class_size: number | null;
    class_average: number | null;
    absences_count: number;
    lateness_count: number;
    head_teacher_comment: string | null;
    students: { matricule: string; first_name: string; last_name: string } | null;
    classes: { name: string } | null;
    academic_periods: { name: string } | null;
    report_card_items: {
      subject_name_snapshot: string;
      coefficient: number;
      average: number | null;
      weighted_points: number | null;
      class_average: number | null;
      class_min: number | null;
      class_max: number | null;
      rank: number | null;
      sequence: number;
    }[];
  };

  const num = (v: number | null) => (v === null ? null : Number(v));
  return {
    id: r.id,
    status: r.status,
    student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
    matricule: r.students?.matricule ?? '',
    klass: r.classes?.name ?? '—',
    period: r.academic_periods?.name ?? '—',
    school: ctx.school.name,
    general_average: num(r.general_average),
    rank: r.rank,
    class_size: r.class_size,
    class_average: num(r.class_average),
    absences: r.absences_count,
    lateness: r.lateness_count,
    head_teacher_comment: r.head_teacher_comment,
    items: (r.report_card_items ?? [])
      .sort((a, b) => a.sequence - b.sequence)
      .map((it) => ({
        subject: it.subject_name_snapshot,
        coefficient: Number(it.coefficient),
        average: num(it.average),
        weighted: num(it.weighted_points),
        class_average: num(it.class_average),
        class_min: num(it.class_min),
        class_max: num(it.class_max),
        rank: it.rank,
      })),
  };
}

/** Bulletins PUBLIÉS visibles par l'utilisateur courant (portail élève/parent). */
export async function listMyBulletins(ctx: TenantContext): Promise<{ id: string; student: string; klass: string; period: string; average: number | null; rank: number | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select('id, general_average, rank, status, students(first_name, last_name), classes(name), academic_periods(name, sequence)')
    .eq('school_id', ctx.school.id)
    .eq('status', 'PUBLISHED');
  return ((data ?? []) as unknown as {
    id: string;
    general_average: number | null;
    rank: number | null;
    students: { first_name: string; last_name: string } | null;
    classes: { name: string } | null;
    academic_periods: { name: string; sequence: number } | null;
  }[])
    .map((r) => ({
      id: r.id,
      student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
      klass: r.classes?.name ?? '—',
      period: r.academic_periods?.name ?? '—',
      average: r.general_average === null ? null : Number(r.general_average),
      rank: r.rank,
    }));
}
