import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable, hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { JustificationInput } from './schemas';

export type JustificationRow = {
  id: string;
  student: string;
  covers_from: string;
  covers_to: string;
  reason: string;
  status: string;
  decision_comment: string | null;
};

export async function listJustifications(ctx: TenantContext, status?: string): Promise<JustificationRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('absence_justifications')
    .select('id, covers_from, covers_to, reason, status, decision_comment, students(first_name, last_name)')
    .eq('school_id', ctx.school.id)
    .order('covers_from', { ascending: false });
  if (status) query = query.eq('status', status as 'PENDING' | 'APPROVED' | 'REJECTED');
  const { data } = await query;
  return ((data ?? []) as unknown as {
    id: string;
    covers_from: string;
    covers_to: string;
    reason: string;
    status: string;
    decision_comment: string | null;
    students: { first_name: string; last_name: string } | null;
  }[]).map((j) => ({
    id: j.id,
    student: j.students ? `${j.students.last_name.toUpperCase()} ${j.students.first_name}` : '—',
    covers_from: j.covers_from,
    covers_to: j.covers_to,
    reason: j.reason,
    status: j.status,
    decision_comment: j.decision_comment,
  }));
}

/**
 * Une absence se justifie jusqu'à la CLÔTURE DU TRIMESTRE (règle de
 * l'établissement) : pas de délai en jours. Un trimestre est clos quand ses
 * moyennes sont verrouillées ou publiées (LOCKED, PUBLISHED) — justifier
 * après coup changerait un bulletin déjà arrêté. Seules comptent les périodes
 * de l'ordre de l'élève (trimestres du général, semestres du technique).
 */
async function closedPeriodCovering(ctx: TenantContext, studentId: string, from: string, to: string): Promise<string | null> {
  const supabase = await createClient();
  const [{ data: enr }, { data: periods }] = await Promise.all([
    supabase
      .from('student_enrollments')
      .select('classes(levels(cycles(track)))')
      .eq('school_id', ctx.school.id)
      .eq('student_id', studentId)
      .eq('status', 'ENROLLED')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('academic_periods')
      .select('name, tracks')
      .eq('school_id', ctx.school.id)
      .in('status', ['LOCKED', 'PUBLISHED'])
      .lte('starts_on', to)
      .gte('ends_on', from),
  ]);
  const track =
    (enr as unknown as { classes: { levels: { cycles: { track: string | null } | null } | null } | null } | null)?.classes?.levels
      ?.cycles?.track ?? 'GENERAL';
  const closed = ((periods ?? []) as { name: string; tracks: string[] | null }[]).find(
    (p) => !p.tracks || p.tracks.includes(track),
  );
  return closed?.name ?? null;
}

export async function submitJustification(ctx: TenantContext, input: JustificationInput): Promise<void> {
  requireWritable(ctx, 'attendance.justify');
  const closed = await closedPeriodCovering(ctx, input.studentId, input.coversFrom, input.coversTo);
  if (closed) {
    throw new ValidationError(`« ${closed} » est clôturé : ses absences ne peuvent plus être justifiées.`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from('absence_justifications').insert({
    school_id: ctx.school.id,
    student_id: input.studentId,
    covers_from: input.coversFrom,
    covers_to: input.coversTo,
    reason: input.reason,
    submitted_by: ctx.user.id,
    status: 'PENDING',
  });
  if (error) throw error;
  await audit(ctx, { action: 'attendance.justify_submit', module: 'attendance', entityType: 'absence_justification', after: { student: input.studentId } });
}

/**
 * Décision d'un justificatif. À l'approbation, les absences/retards couverts par
 * la période sont passés en EXCUSED si le décideur a le droit de modifier un
 * appel. Sans ce droit, les lignes restent ABSENT, mais elles comptent quand
 * même comme justifiées : le bulletin (public.attendance_hours) et l'espace
 * parent tiennent compte des justificatifs APPROUVÉS, y compris pour une
 * absence saisie après l'approbation.
 */
export async function decideJustification(
  ctx: TenantContext,
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  comment: string,
): Promise<{ excused: number }> {
  requireWritable(ctx, 'attendance.justify');
  const supabase = await createClient();

  const { data: j } = await supabase
    .from('absence_justifications')
    .select('id, student_id, covers_from, covers_to, status')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!j) throw new NotFoundError('Justificatif introuvable.');
  // Une décision ne se reprend pas : approuver puis refuser laissait les
  // absences déjà passées en « excusé », et le bulletin les comptait justifiées.
  if (j.status !== 'PENDING') {
    throw new ConflictError('Ce justificatif a déjà été traité.');
  }
  if (decision === 'APPROVED') {
    const closed = await closedPeriodCovering(ctx, j.student_id, j.covers_from, j.covers_to);
    if (closed) throw new ValidationError(`« ${closed} » est clôturé : ce justificatif ne peut plus être approuvé.`);
  }

  const { error } = await supabase
    .from('absence_justifications')
    .update({ status: decision, decided_by: ctx.user.id, decided_at: new Date().toISOString(), decision_comment: comment || null })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;

  let excused = 0;
  if (decision === 'APPROVED' && hasPermission(ctx, 'attendance.update')) {
    excused = await markExcused(ctx, j.student_id, j.covers_from, j.covers_to);
  }

  await audit(ctx, { action: 'attendance.justify_decide', module: 'attendance', entityType: 'absence_justification', entityId: id, after: { decision, excused } });
  return { excused };
}

/** Passe en EXCUSED les absences/retards d'un élève sur une période datée. */
async function markExcused(ctx: TenantContext, studentId: string, from: string, to: string): Promise<number> {
  const supabase = await createClient();

  // Occurrences de la période -> registres correspondants.
  const { data: occs } = await supabase
    .from('session_occurrences')
    .select('id')
    .eq('school_id', ctx.school.id)
    .gte('occurs_on', from)
    .lte('occurs_on', to);
  const occIds = (occs ?? []).map((o) => o.id);
  if (occIds.length === 0) return 0;

  const { data: regs } = await supabase
    .from('attendance_registers')
    .select('id')
    .eq('school_id', ctx.school.id)
    .in('session_occurrence_id', occIds);
  const regIds = (regs ?? []).map((r) => r.id);
  if (regIds.length === 0) return 0;

  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({ status: 'EXCUSED', minutes_late: 0 })
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .in('register_id', regIds)
    .in('status', ['ABSENT', 'LATE'])
    .select('id');
  if (error) throw error;
  return updated?.length ?? 0;
}
