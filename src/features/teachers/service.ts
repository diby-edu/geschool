import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import type { TeacherInput } from './schemas';

function toRow(ctx: TenantContext, input: TeacherInput) {
  let phone: string | null = null;
  if (input.phone && input.phone.trim() !== '') {
    phone = normalizePhone(input.phone, ctx.school.countryCode);
    if (!phone) throw new ValidationError('Numero de telephone invalide.');
  }
  return {
    staff_number: input.staffNumber,
    first_name: input.firstName,
    last_name: input.lastName,
    gender: input.gender || null,
    phone_e164: phone,
    email: input.email || null,
    specialty: input.specialty || null,
    employment_type: input.employmentType,
    status: input.status,
  };
}

export async function createTeacher(ctx: TenantContext, input: TeacherInput): Promise<string> {
  requireWritable(ctx, 'teachers.create');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teachers')
    .insert({ school_id: ctx.school.id, ...toRow(ctx, input) })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un enseignant porte deja ce matricule.');
    throw error;
  }
  await audit(ctx, { action: 'teachers.create', module: 'teachers', entityType: 'teacher', entityId: data.id, after: { ...toRow(ctx, input) } });
  return data.id;
}

export async function updateTeacher(ctx: TenantContext, id: string, input: TeacherInput): Promise<void> {
  requireWritable(ctx, 'teachers.update');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teachers')
    .update(toRow(ctx, input))
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un enseignant porte deja ce matricule.');
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
