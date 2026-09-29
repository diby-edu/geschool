import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getConfig } from '@/features/schedule/config';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import type { TeacherInput } from './schemas';

/**
 * Durée d'une séance dans cet établissement : celle de la grille horaire de
 * l'année active. Faute de grille, une heure pleine. C'est la même règle que
 * pour les volumes du programme — un service se compte en séances, pas en
 * minutes d'horloge.
 */
export async function schoolSessionMinutes(ctx: TenantContext): Promise<number> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return 60;
  const config = await getConfig(ctx, yearId);
  const minutes = config?.default_session_minutes;
  return minutes && minutes > 0 ? minutes : 60;
}

/** « 18 séances » -> minutes. Vide ou 0 = aucune borne. */
function sessionsToMinutes(value: number | '' | undefined, sessionMinutes: number): number | null {
  if (value === '' || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) * sessionMinutes : null;
}

function toRow(ctx: TenantContext, input: TeacherInput, sessionMinutes: number) {
  let phone: string | null = null;
  if (input.phone && input.phone.trim() !== '') {
    phone = normalizePhone(input.phone, ctx.school.countryCode);
    if (!phone) throw new ValidationError('Numéro de téléphone invalide.');
  }
  return {
    staff_number: input.staffNumber,
    first_name: input.firstName,
    last_name: input.lastName,
    gender: input.gender || null,
    birth_date: input.birthDate || null,
    phone_e164: phone,
    email: input.email || null,
    address: input.address || null,
    specialty: input.specialty || null,
    employment_type: input.employmentType,
    status: input.status,
    hire_date: input.hireDate || null,
    diploma: input.diploma || null,
    diploma_detail: input.diplomaDetail || null,
    // Le service se saisit en séances ; la base garde des minutes, comme les
    // volumes horaires du programme.
    weekly_minutes_min: sessionsToMinutes(input.minSessions, sessionMinutes),
    weekly_minutes_max: sessionsToMinutes(input.maxSessions, sessionMinutes),
  };
}

export async function createTeacher(ctx: TenantContext, input: TeacherInput): Promise<string> {
  requireWritable(ctx, 'teachers.create');
  const supabase = await createClient();
  const sessionMinutes = await schoolSessionMinutes(ctx);
  const { data, error } = await supabase
    .from('teachers')
    .insert({ school_id: ctx.school.id, ...toRow(ctx, input, sessionMinutes) })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un enseignant porte déjà ce matricule.');
    throw error;
  }
  await audit(ctx, { action: 'teachers.create', module: 'teachers', entityType: 'teacher', entityId: data.id, after: { ...toRow(ctx, input, sessionMinutes) } });
  return data.id;
}

export async function updateTeacher(ctx: TenantContext, id: string, input: TeacherInput): Promise<void> {
  requireWritable(ctx, 'teachers.update');
  const supabase = await createClient();
  const sessionMinutes = await schoolSessionMinutes(ctx);
  const { data, error } = await supabase
    .from('teachers')
    .update(toRow(ctx, input, sessionMinutes))
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un enseignant porte déjà ce matricule.');
    throw error;
  }
  if (!data) throw new NotFoundError('Enseignant introuvable.');
  await audit(ctx, { action: 'teachers.update', module: 'teachers', entityType: 'teacher', entityId: id });
}

/**
 * Suppression logique : l'enseignant peut etre reference par des affectations
 * ou des emplois du temps passes. On l'archive (deleted_at, status LEFT) plutot
 * que de le supprimer physiquement — l'historique reste coherent (§13/§56).
 */
export async function archiveTeacher(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'teachers.delete');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teachers')
    .update({ deleted_at: new Date().toISOString(), status: 'LEFT' })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Enseignant introuvable.');
  await audit(ctx, { action: 'teachers.archive', module: 'teachers', entityType: 'teacher', entityId: id });
}
