import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { myChildrenIds } from '@/features/family/children';
import type { BulletinRow, BulletinDetail } from './types';

export { BULLETIN_STATUS, bulletinStateLabel } from './types';
export type { BulletinRow, BulletinItem, BulletinDetail } from './types';

export async function listBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<BulletinRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select('id, general_average, rank, status, signed_at, students(matricule, first_name, last_name)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId);
  return ((data ?? []) as unknown as {
    id: string;
    general_average: number | null;
    rank: number | null;
    status: string;
    signed_at: string | null;
    students: { matricule: string; first_name: string; last_name: string } | null;
  }[])
    .map((r) => ({
      id: r.id,
      student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
      matricule: r.students?.matricule ?? '',
      general_average: r.general_average === null ? null : Number(r.general_average),
      rank: r.rank,
      status: r.status,
      signed: r.signed_at !== null,
    }))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.student.localeCompare(b.student));
}

export async function getBulletin(ctx: TenantContext, id: string): Promise<BulletinDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select(
      'id, status, general_average, rank, class_size, class_average, absences_count, lateness_count, head_teacher_comment, ' +
        'council_comment, distinction, distinction_label, distinction_note, annual_average, annual_rank, decision, decision_label, ' +
        'student_id, academic_year_id, revision, ' +
        'students(matricule, first_name, last_name), classes(name), academic_periods(name, sequence), ' +
        'report_card_items(subject_name_snapshot, teacher_name_snapshot, appreciation, coefficient, average, weighted_points, class_average, class_min, class_max, rank, sequence)',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as PrintRow;

  const num = (v: number | null) => (v === null ? null : Number(v));

  // Le rappel des périodes précédentes se lit sur les bulletins DÉJÀ produits,
  // jamais en recalculant : un bulletin remis en décembre et le bilan de juin
  // doivent porter le même chiffre, même si une note a été corrigée depuis.
  const previous: { name: string; average: number | null; rank: number | null }[] = [];
  const sequence = r.academic_periods?.sequence ?? 0;
  if (sequence > 1) {
    const { data: avant } = await supabase
      .from('report_cards')
      .select('general_average, rank, academic_periods!inner(name, sequence)')
      .eq('school_id', ctx.school.id)
      .eq('student_id', r.student_id)
      .eq('academic_year_id', r.academic_year_id)
      .lt('academic_periods.sequence', sequence);
    const rows = (avant ?? []) as unknown as {
      general_average: number | null;
      rank: number | null;
      academic_periods: { name: string; sequence: number } | null;
    }[];
    previous.push(
      ...rows
        .sort((a, b) => (a.academic_periods?.sequence ?? 0) - (b.academic_periods?.sequence ?? 0))
        .map((p) => ({
          name: p.academic_periods?.name ?? '—',
          average: num(p.general_average),
          rank: p.rank,
        })),
    );
  }

  return toDetail(ctx, r, previous);
}

/** Bulletins PUBLIÉS visibles par l'utilisateur courant (portail élève/parent). */
export async function listMyBulletins(ctx: TenantContext, opts: { childrenOnly?: boolean } = {}): Promise<{ id: string; student: string; klass: string; period: string; average: number | null; rank: number | null }[]> {
  const supabase = await createClient();
  let query = supabase
    .from('report_cards')
    .select('id, general_average, rank, status, students(first_name, last_name), classes(name), academic_periods(name, sequence)')
    .eq('school_id', ctx.school.id)
    .eq('status', 'PUBLISHED');
  // Espace Parent : uniquement les bulletins de SES enfants (une personne qui
  // est aussi enseignante verrait sinon ceux de ses classes).
  if (opts.childrenOnly) {
    const childIds = await myChildrenIds(ctx);
    if (childIds.length === 0) return [];
    query = query.in('student_id', childIds);
  }
  const { data } = await query;
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

/**
 * Tous les bulletins d'une classe, prêts à imprimer.
 *
 * Deux requêtes pour toute la classe, pas deux par élève : sortir cinquante
 * bulletins ne doit pas faire cent allers-retours.
 */
export async function listBulletinsForPrint(
  ctx: TenantContext,
  classId: string,
  periodId: string,
): Promise<BulletinDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_cards')
    .select(
      'id, status, general_average, rank, class_size, class_average, absences_count, lateness_count, head_teacher_comment, ' +
        'council_comment, distinction, distinction_label, distinction_note, annual_average, annual_rank, decision, decision_label, ' +
        'student_id, academic_year_id, revision, ' +
        'students(matricule, first_name, last_name), classes(name), academic_periods(name, sequence), ' +
        'report_card_items(subject_name_snapshot, teacher_name_snapshot, appreciation, coefficient, average, weighted_points, class_average, class_min, class_max, rank, sequence)',
    )
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId);

  const rows = (data ?? []) as unknown as PrintRow[];
  if (rows.length === 0) return [];

  // Le rappel des périodes précédentes, pour toute la classe d'un coup.
  const sequence = rows[0]?.academic_periods?.sequence ?? 0;
  const before = new Map<string, { name: string; average: number | null; rank: number | null; sequence: number }[]>();
  if (sequence > 1) {
    const { data: avant } = await supabase
      .from('report_cards')
      .select('student_id, general_average, rank, academic_periods!inner(name, sequence)')
      .eq('school_id', ctx.school.id)
      .eq('class_id', classId)
      .eq('academic_year_id', rows[0]!.academic_year_id)
      .lt('academic_periods.sequence', sequence);
    for (const p of (avant ?? []) as unknown as {
      student_id: string;
      general_average: number | null;
      rank: number | null;
      academic_periods: { name: string; sequence: number } | null;
    }[]) {
      const liste = before.get(p.student_id) ?? [];
      liste.push({
        name: p.academic_periods?.name ?? '—',
        average: p.general_average === null ? null : Number(p.general_average),
        rank: p.rank,
        sequence: p.academic_periods?.sequence ?? 0,
      });
      before.set(p.student_id, liste);
    }
  }

  return rows
    .map((r) => toDetail(ctx, r, (before.get(r.student_id) ?? []).sort((a, b) => a.sequence - b.sequence)))
    .sort((a, b) => a.student.localeCompare(b.student, 'fr'));
}

// -----------------------------------------------------------------------------
// Conversion commune : l'écran d'un bulletin et l'impression d'une classe
// entière doivent produire exactement la même page.
// -----------------------------------------------------------------------------

type PrintRow = {
  id: string;
  status: string;
  general_average: number | null;
  rank: number | null;
  class_size: number | null;
  class_average: number | null;
  absences_count: number;
  lateness_count: number;
  head_teacher_comment: string | null;
  council_comment: string | null;
  distinction_label: string | null;
  distinction_note: string | null;
  annual_average: number | null;
  annual_rank: number | null;
  decision_label: string | null;
  revision: number | null;
  student_id: string;
  academic_year_id: string;
  students: { matricule: string; first_name: string; last_name: string } | null;
  classes: { name: string } | null;
  academic_periods: { name: string; sequence: number } | null;
  report_card_items: {
    subject_name_snapshot: string;
    teacher_name_snapshot: string | null;
    appreciation: string | null;
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

function toDetail(
  ctx: TenantContext,
  r: PrintRow,
  previous: { name: string; average: number | null; rank: number | null }[],
): BulletinDetail {
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
    council_comment: r.council_comment,
    distinction_label: r.distinction_label,
    distinction_note: r.distinction_note,
    annual_average: num(r.annual_average),
    annual_rank: r.annual_rank,
    decision_label: r.decision_label,
    revision: r.revision ?? 0,
    previous,
    items: (r.report_card_items ?? [])
      .sort((a, b) => a.sequence - b.sequence)
      .map((it) => ({
        subject: it.subject_name_snapshot,
        teacher: it.teacher_name_snapshot,
        appreciation: it.appreciation,
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
