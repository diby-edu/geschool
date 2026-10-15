import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';

/**
 * Vérification du professeur principal (migration 0111) : signalements,
 * certification de la classe, déverrouillage par la direction, journal.
 * La base applique toutes les règles (qui, quand, blocages) ; ce module les
 * appelle et les lit.
 */

export type FlagStatus = 'OPEN' | 'CORRECTED' | 'MAINTAINED' | 'CANCELLED';

export type GradeFlag = {
  id: string;
  studentId: string;
  subjectId: string;
  student: string;
  subject: string;
  status: FlagStatus;
  raisedAt: string;
  resolvedAt: string | null;
};

export const FLAG_LABEL: Record<FlagStatus, string> = {
  OPEN: 'En attente du professeur',
  CORRECTED: 'Corrigé',
  MAINTAINED: 'Maintenu',
  CANCELLED: 'Annulé',
};

export async function listFlags(ctx: TenantContext, classId: string, periodId: string, subjectId?: string): Promise<GradeFlag[]> {
  const supabase = await createClient();
  let q = supabase
    .from('grade_flags')
    .select('id, student_id, subject_id, status, raised_at, resolved_at, students(first_name, last_name), subjects(name)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId)
    .neq('status', 'CANCELLED')
    .order('raised_at', { ascending: false });
  if (subjectId) q = q.eq('subject_id', subjectId);
  const { data } = await q;
  return ((data ?? []) as unknown as {
    id: string;
    student_id: string;
    subject_id: string;
    status: FlagStatus;
    raised_at: string;
    resolved_at: string | null;
    students: { first_name: string; last_name: string } | null;
    subjects: { name: string } | null;
  }[]).map((f) => ({
    id: f.id,
    studentId: f.student_id,
    subjectId: f.subject_id,
    student: f.students ? `${f.students.last_name.toUpperCase()} ${f.students.first_name}` : '—',
    subject: f.subjects?.name ?? 'Matière',
    status: f.status,
    raisedAt: f.raised_at,
    resolvedAt: f.resolved_at,
  }));
}

export type ClassTermStatus = {
  certifiedAt: string | null;
  certifiedBy: string | null;
  unlockedAt: string | null;
  unlockedBy: string | null;
  unlockReason: string | null;
};

export async function classTermStatus(ctx: TenantContext, classId: string, periodId: string): Promise<ClassTermStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('class_term_status')
    .select('certified_at, unlocked_at, unlock_reason, certifier:certified_by(first_name, last_name, display_name), unlocker:unlocked_by(first_name, last_name, display_name)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId)
    .maybeSingle();
  type U = { first_name: string | null; last_name: string | null; display_name: string | null } | null;
  const name = (u: U) => (u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || u.display_name || null : null);
  const d = data as unknown as {
    certified_at: string | null;
    unlocked_at: string | null;
    unlock_reason: string | null;
    certifier: U;
    unlocker: U;
  } | null;
  return {
    certifiedAt: d?.certified_at ?? null,
    certifiedBy: name(d?.certifier ?? null),
    unlockedAt: d?.unlocked_at ?? null,
    unlockedBy: name(d?.unlocker ?? null),
    unlockReason: d?.unlock_reason ?? null,
  };
}

export type Blocker = { kind: 'NOT_DONE' | 'OPEN_FLAG'; subject: string; teacher: string | null; student: string | null };

/** Ce qui empêche de certifier : matières non déclarées finies, signalements ouverts. */
export async function certificationBlockers(_ctx: TenantContext, classId: string, periodId: string): Promise<Blocker[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('class_certification_blockers' as never, { p_class: classId, p_period: periodId } as never);
  return ((data ?? []) as Blocker[]).sort((a, b) => a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
}

export async function flagGrade(ctx: TenantContext, classId: string, periodId: string, studentId: string, subjectId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('flag_grade' as never, {
    p_class: classId,
    p_period: periodId,
    p_student: studentId,
    p_subject: subjectId,
  } as never);
  if (error) throw error;
  await audit(ctx, { action: 'grades.flag', module: 'grades', entityType: 'student', entityId: studentId, after: { classId, periodId, subjectId } });
}

export async function resolveFlag(ctx: TenantContext, flagId: string, status: 'CORRECTED' | 'MAINTAINED' | 'CANCELLED'): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_grade_flag' as never, { p_flag: flagId, p_status: status } as never);
  if (error) throw error;
  await audit(ctx, { action: `grades.flag_${status.toLowerCase()}`, module: 'grades', entityType: 'grade_flag', entityId: flagId });
}

export async function certifyClass(ctx: TenantContext, classId: string, periodId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('certify_class' as never, { p_class: classId, p_period: periodId } as never);
  if (error) throw error;
  await audit(ctx, { action: 'grades.certify', module: 'grades', entityType: 'class', entityId: classId, after: { periodId } });
}

export async function unlockClass(ctx: TenantContext, classId: string, periodId: string, reason: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('unlock_class' as never, { p_class: classId, p_period: periodId, p_reason: reason } as never);
  if (error) throw error;
  await audit(ctx, { action: 'grades.unlock', module: 'grades', entityType: 'class', entityId: classId, after: { periodId, reason } });
}

export type JournalEntry = {
  at: string;
  actor: string;
  action: string;
  student: string | null;
  subject: string | null;
  detail: string;
};

const ACTION_LABEL: Record<string, string> = {
  'grades.term_create': 'Note saisie',
  'grades.term_update': 'Note modifiée',
  'grades.term_delete': 'Note effacée',
  'grades.flag': 'Moyenne signalée par le professeur principal',
  'grades.flag_corrected': 'Signalement : corrigé',
  'grades.flag_maintained': 'Signalement : maintenu',
  'grades.flag_cancelled': 'Signalement annulé',
  'grades.certify': 'Classe certifiée par le professeur principal',
  'grades.unlock': 'Classe déverrouillée',
  'grades.completion': '« J’ai fini mes moyennes »',
  'grades.exemption_add': 'Dispense d’EPS déclarée',
  'grades.exemption_remove': 'Dispense d’EPS retirée',
  'grades.council_average': 'Moyenne retenue par le conseil',
  'grades.council_average_remove': 'Moyenne retenue retirée',
};

const score = (v: unknown, absent: unknown) =>
  absent === true ? 'absent' : v === null || v === undefined ? 'vide' : String(v).replace(/\.?0+$/, '').replace('.', ',');

/** Le journal de fin de trimestre d'une classe, du plus récent au plus ancien. */
export async function termJournal(_ctx: TenantContext, classId: string, periodId: string): Promise<JournalEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('term_journal' as never, { p_class: classId, p_period: periodId } as never);
  if (error) throw error;
  return ((data ?? []) as {
    created_at: string;
    actor: string;
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    student: string | null;
    subject: string | null;
  }[]).map((r) => {
    let detail = '';
    if (r.action.startsWith('grades.term_')) {
      detail = `${score(r.before?.score, r.before?.is_absent)} → ${score(r.after?.score, r.after?.is_absent)}`;
    } else if (r.action === 'grades.unlock') {
      detail = `Motif : ${String(r.after?.reason ?? '')}`;
    } else if (r.action.startsWith('grades.council_average')) {
      const avant = r.before?.average ?? r.after?.computed;
      detail = `${score(avant, false)} → ${r.after?.average === null || r.after?.average === undefined ? 'calculée' : score(r.after.average, false)} (${String(r.after?.reason ?? '')})`;
    } else if (r.action.startsWith('grades.exemption')) {
      detail = String(r.after?.student ?? '');
    }
    return {
      at: r.created_at,
      actor: r.actor,
      action: ACTION_LABEL[r.action] ?? r.action,
      student: r.student,
      subject: r.subject,
      detail,
    };
  });
}

export type ClassVerification = {
  status: ClassTermStatus;
  blockers: Blocker[];
  phase: string;
  className: string;
  headTeacher: string | null;
};

/** Tout ce que la direction doit voir de la vérification d'une classe. */
export async function loadClassVerification(ctx: TenantContext, classId: string, periodId: string): Promise<ClassVerification> {
  const supabase = await createClient();
  const [status, blockers, { data: phase }, { data: k }] = await Promise.all([
    classTermStatus(ctx, classId, periodId),
    certificationBlockers(ctx, classId, periodId),
    supabase.rpc('term_phase' as never, { p_period: periodId } as never),
    supabase
      .from('classes')
      .select('name, teachers:head_teacher_id(first_name, last_name)')
      .eq('school_id', ctx.school.id)
      .eq('id', classId)
      .maybeSingle(),
  ]);
  const klass = k as unknown as { name: string; teachers: { first_name: string; last_name: string } | null } | null;
  return {
    status,
    blockers,
    phase: (phase as string | null) ?? 'OPEN',
    className: klass?.name ?? '',
    headTeacher: klass?.teachers ? `${klass.teachers.last_name.toUpperCase()} ${klass.teachers.first_name}` : null,
  };
}
