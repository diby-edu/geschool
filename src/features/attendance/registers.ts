import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable, hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { signAvatarUrls } from '@/lib/storage/avatars';
import { getOccurrence, type OccurrenceDetail } from './occurrences';
import { uniqueStudents } from './targets';
import { absentAtOpening, courseHours, hourAt } from './course-hours';

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
  /** État à l'heure en cours (ou, hors du cours, sur l'ensemble du cours). */
  status: string;
  minutesLate: number;
  comment: string;
  /** Heures du cours où l'élève était absent (0170). */
  absentHours: number[];
};

/** Une heure du cours et l'état de son appel. */
export type AppelHour = { hour: number; startsIso: string; endsIso: string; taken: boolean; absents: number };

export type Appel = {
  occurrenceId: string;
  subject: string;
  klass: string;
  when: string;
  registerId: string | null;
  registerStatus: string | null;
  editable: boolean;
  students: AppelStudent[];
  /** Les heures du cours (une seule pour un cours d'1 h). */
  hours: AppelHour[];
  /** L'heure en cours, celle dont l'appel se fait maintenant ; null hors du cours. */
  currentHour: number | null;
};

type RosterEntry = { studentId: string; matricule: string; name: string; photoPath: string | null };

type StudentJoin = { matricule: string; first_name: string; last_name: string; photo_url: string | null } | null;

/**
 * Les élèves attendus à un cours : ceux des classes visées, plus ceux des
 * groupes visés (LV2, option) encore membres le jour du cours. Un élève
 * présent par les deux chemins n'apparaît qu'une fois.
 */
export async function loadRoster(ctx: TenantContext, occ: OccurrenceDetail): Promise<RosterEntry[]> {
  const supabase = await createClient();
  const toEntry = (studentId: string, s: StudentJoin): RosterEntry => ({
    studentId,
    matricule: s?.matricule ?? '',
    name: s ? `${s.last_name.toUpperCase()} ${s.first_name}` : '—',
    photoPath: s?.photo_url ?? null,
  });

  const [byClass, byGroup] = await Promise.all([
    occ.class_ids.length > 0
      ? supabase
          .from('student_enrollments')
          .select('student_id, students(matricule, first_name, last_name, photo_url)')
          .eq('school_id', ctx.school.id)
          .in('class_id', occ.class_ids)
          .eq('status', 'ENROLLED')
      : Promise.resolve({ data: [] as unknown[] }),
    occ.group_ids.length > 0
      ? supabase
          .from('student_groups')
          .select('student_id, left_at, students(matricule, first_name, last_name, photo_url)')
          .eq('school_id', ctx.school.id)
          .in('group_id', occ.group_ids)
          .lte('joined_at', occ.occurs_on)
          .or(`left_at.is.null,left_at.gt.${occ.occurs_on}`)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const rows = [
    ...((byClass.data ?? []) as { student_id: string; students: StudentJoin }[]),
    ...((byGroup.data ?? []) as { student_id: string; students: StudentJoin }[]),
  ].map((r) => toEntry(r.student_id, r.students));

  return uniqueStudents(rows).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadAppel(ctx: TenantContext, occurrenceId: string): Promise<Appel> {
  const supabase = await createClient();
  const occ = await getOccurrence(ctx, occurrenceId);
  if (!occ) throw new NotFoundError('Séance introuvable.');

  const [{ data: regRow }, { data: count }] = await Promise.all([
    supabase
      .from('attendance_registers')
      .select('id, status, hours_taken')
      .eq('school_id', ctx.school.id)
      .eq('session_occurrence_id', occurrenceId)
      .maybeSingle(),
    supabase.rpc('occurrence_course_hours' as never, { p_school: ctx.school.id, p_occurrence: occurrenceId } as never),
  ]);
  const reg = regRow as { id: string; status: string; hours_taken: (string | null)[] | null } | null;

  const records = new Map<string, { status: string; minutes_late: number; comment: string | null; absent_hours: number[] | null }>();
  if (reg) {
    const { data: recs } = await supabase
      .from('attendance_records')
      .select('student_id, status, minutes_late, comment, absent_hours')
      .eq('school_id', ctx.school.id)
      .eq('register_id', reg.id);
    for (const r of (recs ?? []) as unknown as { student_id: string; status: string; minutes_late: number; comment: string | null; absent_hours: number[] | null }[]) {
      records.set(r.student_id, r);
    }
  }

  // Les heures du cours et celle qui se fait maintenant (0170).
  const n = typeof count === 'number' && count > 0 ? count : 1;
  const taken = (h: number) => Boolean(reg?.hours_taken?.[h - 1]);
  const currentHour = hourAt(occ.starts_iso, occ.ends_iso, n, Date.now());

  const roster = await loadRoster(ctx, occ);
  const signedByPath = await signAvatarUrls(roster.map((e) => e.photoPath));
  const students: AppelStudent[] = roster.map((e) => {
    const rec = records.get(e.studentId);
    const absentHours = rec?.absent_hours ?? [];
    // Pendant le cours : l'état de l'heure en cours (la liste reprend les
    // absents de l'heure d'avant tant que cette heure n'est pas faite).
    const status =
      currentHour !== null
        ? absentAtOpening(absentHours, currentHour, taken(currentHour))
          ? 'ABSENT'
          : 'PRESENT'
        : (rec?.status ?? 'PRESENT');
    return {
      studentId: e.studentId,
      matricule: e.matricule,
      name: e.name,
      photoUrl: e.photoPath ? (signedByPath.get(e.photoPath) ?? null) : null,
      status,
      minutesLate: rec?.minutes_late ?? 0,
      comment: rec?.comment ?? '',
      absentHours,
    };
  });
  const hours: AppelHour[] = courseHours(occ.starts_iso, occ.ends_iso, n).map((h) => ({
    ...h,
    taken: taken(h.hour),
    absents: students.filter((s) => s.absentHours.includes(h.hour)).length,
  }));

  // Modifiable tant que le creneau dure (OPEN ou deja SUBMITTED) ; ferme des
  // que la vie scolaire a valide, ou des que le cours est termine.
  //
  // La fenetre du creneau compte dans l'AFFICHAGE, pas seulement a l'ecriture :
  // sans cela l'ecran proposait de corriger un appel que le serveur refusait
  // ensuite. L'appel ne se fait que pendant le cours — c'est aussi ce qui
  // atteste que l'enseignant etait la.
  const dansLeCreneau = await canActOnOccurrence(ctx, occurrenceId);
  const editable =
    hasPermission(ctx, 'attendance.update') ||
    (dansLeCreneau && (!reg || reg.status === 'OPEN' || reg.status === 'SUBMITTED'));

  return {
    occurrenceId,
    subject: occ.subject,
    klass: occ.klass,
    when: `${occ.occurs_on} · ${occ.starts_at}–${occ.ends_at}`,
    registerId: reg?.id ?? null,
    registerStatus: reg?.status ?? null,
    editable,
    students,
    hours,
    currentHour,
  };
}

/**
 * Verrouille un appel (OPEN -> SUBMITTED). `takenAt` : l'instant où
 * l'enseignant a appuyé sur « Valider », quand l'appel arrive hors ligne,
 * après coup. Le droit se juge alors à cet instant (migration 0105).
 */
export async function submitRegister(ctx: TenantContext, registerId: string, takenAt?: string): Promise<void> {
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from('attendance_registers')
    .select('id, status, session_occurrence_id')
    .eq('school_id', ctx.school.id)
    .eq('id', registerId)
    .maybeSingle();
  if (!reg) throw new NotFoundError('Appel introuvable.');
  // Le verrou, c'est la fin du créneau, pas la validation : un enseignant qui
  // valide en debut d'heure doit pouvoir corriger l'eleve arrive en retard,
  // tant que le cours dure. Seul un appel VALIDE par la vie scolaire se ferme.
  if (reg.status === 'VALIDATED') {
    throw new ConflictError('Cet appel a été validé par la vie scolaire : il ne peut plus être modifié.');
  }
  if (!takenAt) await requireCanAct(ctx, reg.session_occurrence_id);
  const { error } = await supabase.rpc('submit_attendance_register' as never, {
    p_register: registerId,
    ...(takenAt ? { p_at: takenAt } : {}),
  } as never);
  if (error) {
    if (error.code === '42501') throw new AuthorizationError("Vous n'êtes pas habilité à valider cet appel.");
    throw error;
  }
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
