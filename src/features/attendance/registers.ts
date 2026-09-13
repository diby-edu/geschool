import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable, hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { signAvatarUrls } from '@/lib/storage/avatars';
import { getOccurrence } from './occurrences';

/**
 * Un enseignant fait l'appel de SES SEANCES sans porter la permission
 * generale 'attendance.create' (reservee aux roles a perimetre etablissement
 * — censeur, surveillant, direction) : son droit est DERIVE de l'emploi du
 * temps (app.can_take_attendance, migration 0015), deja ce que verifie la
 * RLS sur attendance_registers/attendance_records. Sans cet appel, la
 * couche applicative bloquait a tort un enseignant simple avant meme que la
 * RLS n'ait son mot a dire.
 */
export async function canActOnOccurrence(ctx: TenantContext, occurrenceId: string): Promise<boolean> {
  if (hasPermission(ctx, 'attendance.create')) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc('can_take_attendance' as never, {
    p_school: ctx.school.id,
    p_occurrence: occurrenceId,
  } as never);
  return data === true;
}

async function requireCanAct(ctx: TenantContext, occurrenceId: string): Promise<void> {
  if (!(await canActOnOccurrence(ctx, occurrenceId))) {
    throw new AuthorizationError("Vous n'êtes pas habilité à faire l'appel de cette séance.");
  }
}

export type AppelStudent = {
  studentId: string;
  matricule: string;
  name: string;
  photoUrl: string | null;
  status: string;
  minutesLate: number;
  comment: string;
};

export type Appel = {
  occurrenceId: string;
  subject: string;
  klass: string;
  when: string;
  registerId: string | null;
  registerStatus: string | null;
  editable: boolean;
  students: AppelStudent[];
};

export async function loadAppel(ctx: TenantContext, occurrenceId: string): Promise<Appel> {
  const supabase = await createClient();
  const occ = await getOccurrence(ctx, occurrenceId);
  if (!occ) throw new NotFoundError('Séance introuvable.');

  const { data: reg } = await supabase
    .from('attendance_registers')
    .select('id, status')
    .eq('school_id', ctx.school.id)
    .eq('session_occurrence_id', occurrenceId)
    .maybeSingle();

  const records = new Map<string, { status: string; minutes_late: number; comment: string | null }>();
  if (reg) {
    const { data: recs } = await supabase
      .from('attendance_records')
      .select('student_id, status, minutes_late, comment')
      .eq('school_id', ctx.school.id)
      .eq('register_id', reg.id);
    for (const r of recs ?? []) records.set(r.student_id, r);
  }

  const students: AppelStudent[] = [];
  if (occ.class_id) {
    const { data: enr } = await supabase
      .from('student_enrollments')
      .select('student_id, students(matricule, first_name, last_name, photo_url)')
      .eq('school_id', ctx.school.id)
      .eq('class_id', occ.class_id)
      .eq('status', 'ENROLLED');
    const rows = (enr ?? []) as unknown as {
      student_id: string;
      students: { matricule: string; first_name: string; last_name: string; photo_url: string | null } | null;
    }[];
    const signedByPath = await signAvatarUrls(rows.map((e) => e.students?.photo_url));
    for (const e of rows) {
      const rec = records.get(e.student_id);
      const path = e.students?.photo_url ?? null;
      students.push({
        studentId: e.student_id,
        matricule: e.students?.matricule ?? '',
        name: e.students ? `${e.students.last_name.toUpperCase()} ${e.students.first_name}` : '—',
        photoUrl: path ? (signedByPath.get(path) ?? null) : null,
        status: rec?.status ?? 'PRESENT',
        minutesLate: rec?.minutes_late ?? 0,
        comment: rec?.comment ?? '',
      });
    }
    students.sort((a, b) => a.name.localeCompare(b.name));
  }

  const editable = !reg || reg.status === 'OPEN' || hasPermission(ctx, 'attendance.update');

  return {
    occurrenceId,
    subject: occ.subject,
    klass: occ.klass,
    when: `${occ.occurs_on} · ${occ.starts_at}–${occ.ends_at}`,
    registerId: reg?.id ?? null,
    registerStatus: reg?.status ?? null,
    editable,
    students,
  };
}

export async function submitRegister(ctx: TenantContext, registerId: string): Promise<void> {
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from('attendance_registers')
    .select('id, status, session_occurrence_id')
    .eq('school_id', ctx.school.id)
    .eq('id', registerId)
    .maybeSingle();
  if (!reg) throw new NotFoundError('Appel introuvable.');
  await requireCanAct(ctx, reg.session_occurrence_id);
  if (reg.status !== 'OPEN') throw new ConflictError('Cet appel a déjà été soumis.');
  const { error } = await supabase
    .from('attendance_registers')
    .update({ status: 'SUBMITTED' })
    .eq('school_id', ctx.school.id)
    .eq('id', registerId);
  if (error) throw error;
  await audit(ctx, { action: 'attendance.submit', module: 'attendance', entityType: 'attendance_register', entityId: registerId });
}

export async function validateRegister(ctx: TenantContext, registerId: string): Promise<void> {
  requireWritable(ctx, 'attendance.validate');
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from('attendance_registers')
    .select('id, status')
    .eq('school_id', ctx.school.id)
    .eq('id', registerId)
    .maybeSingle();
  if (!reg) throw new NotFoundError('Appel introuvable.');
  if (reg.status === 'VALIDATED') return;
  const { error } = await supabase
    .from('attendance_registers')
    .update({ status: 'VALIDATED', validated_by: ctx.user.id, validated_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('id', registerId);
  if (error) throw error;
  await audit(ctx, { action: 'attendance.validate', module: 'attendance', entityType: 'attendance_register', entityId: registerId });
}
