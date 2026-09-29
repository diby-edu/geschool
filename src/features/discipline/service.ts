import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Écritures du module discipline.
 *
 * Deux gestes distincts, volontairement : SIGNALER un incident (un enseignant
 * peut le faire pour ses élèves, sans droit particulier) et PRONONCER une
 * sanction (réservé à `discipline.decide`). Celui qui constate n'est pas celui
 * qui punit — la base applique la même règle (RLS 0071).
 */

export type IncidentInput = {
  studentId: string;
  incidentTypeId: string;
  occurredOn: string;
  occurredAt: string;
  description: string;
};

export type SanctionInput = {
  incidentId: string | null;
  studentId: string;
  sanctionTypeId: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

function requireYear(ctx: TenantContext): string {
  if (!ctx.academicYear) throw new ValidationError('Activez une année scolaire d’abord.');
  return ctx.academicYear.id;
}

export async function reportIncident(ctx: TenantContext, input: IncidentInput): Promise<string> {
  const yearId = requireYear(ctx);
  const supabase = await createClient();

  // La classe est celle de l'élève AU MOMENT des faits : il peut en changer.
  const { data: enrollment } = await supabase
    .from('student_enrollments')
    .select('class_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('student_id', input.studentId)
    .eq('status', 'ENROLLED')
    .maybeSingle();

  const { data, error } = await supabase
    .from('discipline_incidents')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      student_id: input.studentId,
      class_id: enrollment?.class_id ?? null,
      incident_type_id: input.incidentTypeId,
      occurred_on: input.occurredOn,
      occurred_at: input.occurredAt || null,
      description: input.description,
      reported_by: ctx.user.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await audit(ctx, {
    action: 'discipline.incident_report',
    module: 'discipline',
    entityType: 'discipline_incident',
    entityId: data.id,
    after: { student: input.studentId, type: input.incidentTypeId, on: input.occurredOn },
  });
  return data.id;
}

/** Clôt un incident (suite donnée, ou sans suite) ou le rouvre. */
export async function setIncidentStatus(ctx: TenantContext, id: string, status: 'OPEN' | 'CLOSED'): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discipline_incidents')
    .update({ status })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Incident introuvable.');
  await audit(ctx, {
    action: status === 'CLOSED' ? 'discipline.incident_close' : 'discipline.incident_reopen',
    module: 'discipline',
    entityType: 'discipline_incident',
    entityId: id,
  });
}

export async function deleteIncident(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'discipline.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('discipline_incidents')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Incident introuvable.');
  await audit(ctx, { action: 'discipline.incident_delete', module: 'discipline', entityType: 'discipline_incident', entityId: id });
}

export async function decideSanction(ctx: TenantContext, input: SanctionInput): Promise<void> {
  requireWritable(ctx, 'discipline.decide');
  if (input.endsOn && input.startsOn && input.endsOn < input.startsOn) {
    throw new ValidationError('La date de fin ne peut pas précéder le début.');
  }
  const supabase = await createClient();
  const { error } = await supabase.from('discipline_sanctions').insert({
    school_id: ctx.school.id,
    incident_id: input.incidentId,
    student_id: input.studentId,
    sanction_type_id: input.sanctionTypeId,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    notes: input.notes,
    decided_by: ctx.user.id,
  });
  if (error) throw error;
  await audit(ctx, {
    action: 'discipline.sanction_decide',
    module: 'discipline',
    entityType: 'discipline_sanction',
    after: { student: input.studentId, type: input.sanctionTypeId },
  });
}

export async function setSanctionStatus(
  ctx: TenantContext,
  id: string,
  status: 'PLANNED' | 'DONE' | 'CANCELLED',
): Promise<void> {
  requireWritable(ctx, 'discipline.decide');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discipline_sanctions')
    .update({ status })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Sanction introuvable.');
  await audit(ctx, {
    action: 'discipline.sanction_status',
    module: 'discipline',
    entityType: 'discipline_sanction',
    entityId: id,
    after: { status },
  });
}

// --- Listes de l'établissement ----------------------------------------------

export async function createIncidentType(ctx: TenantContext, input: { code: string; name: string; points: number }): Promise<void> {
  requireWritable(ctx, 'discipline.configure');
  const supabase = await createClient();
  const { error } = await supabase.from('discipline_incident_types').insert({
    school_id: ctx.school.id,
    code: input.code,
    name: input.name,
    points: input.points,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un motif porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'discipline.type_create', module: 'discipline', entityType: 'discipline_incident_type', after: input });
}

export async function createSanctionType(ctx: TenantContext, input: { code: string; name: string; needsDates: boolean }): Promise<void> {
  requireWritable(ctx, 'discipline.configure');
  const supabase = await createClient();
  const { error } = await supabase.from('discipline_sanction_types').insert({
    school_id: ctx.school.id,
    code: input.code,
    name: input.name,
    needs_dates: input.needsDates,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une sanction porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'discipline.sanction_type_create', module: 'discipline', entityType: 'discipline_sanction_type', after: input });
}

export async function deleteIncidentType(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'discipline.configure');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('discipline_incident_types')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce motif est utilisé par des incidents : désactivez-le plutôt.');
    throw error;
  }
  if (!count) throw new NotFoundError('Motif introuvable.');
  await audit(ctx, { action: 'discipline.type_delete', module: 'discipline', entityType: 'discipline_incident_type', entityId: id });
}

export async function deleteSanctionType(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'discipline.configure');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('discipline_sanction_types')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Cette sanction a déjà été prononcée : désactivez-la plutôt.');
    throw error;
  }
  if (!count) throw new NotFoundError('Sanction introuvable.');
  await audit(ctx, { action: 'discipline.sanction_type_delete', module: 'discipline', entityType: 'discipline_sanction_type', entityId: id });
}
