import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { AcademicYearInput, PeriodInput } from './schemas';

export async function createYear(ctx: TenantContext, input: AcademicYearInput): Promise<string> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_years')
    .insert({
      school_id: ctx.school.id,
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: 'DRAFT',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une annee porte deja ce nom.');
    throw error;
  }
  await audit(ctx, { action: 'academic_years.create', module: 'academic_years', entityType: 'academic_year', entityId: data.id, after: input });
  return data.id;
}

export async function updateYear(ctx: TenantContext, id: string, input: AcademicYearInput): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_years')
    .update({ name: input.name, starts_on: input.startsOn, ends_on: input.endsOn })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une annee porte deja ce nom.');
    throw error;
  }
  if (!data) throw new NotFoundError('Annee introuvable.');
  await audit(ctx, { action: 'academic_years.update', module: 'academic_years', entityType: 'academic_year', entityId: id, after: input });
}

/**
 * Active une annee : elle devient l'annee courante et passe en ACTIVE. Toute
 * autre annee courante est demarquee au prealable — l'index unique partiel
 * (une seule is_current par etablissement) l'exige.
 */
export async function activateYear(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from('academic_years')
    .update({ is_current: false })
    .eq('school_id', ctx.school.id)
    .eq('is_current', true)
    .neq('id', id);
  if (clearError) throw clearError;

  const { data, error } = await supabase
    .from('academic_years')
    .update({ is_current: true, status: 'ACTIVE' })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Annee introuvable.');
  await audit(ctx, { action: 'academic_years.activate', module: 'academic_years', entityType: 'academic_year', entityId: id });
}

/** Cloture une annee : plus aucune ecriture sur ses donnees rattachees (§11). */
export async function closeYear(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'academic_years.close');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_years')
    .update({ status: 'CLOSED', is_current: false })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Annee introuvable.');
  await audit(ctx, { action: 'academic_years.close', module: 'academic_years', entityType: 'academic_year', entityId: id });
}

export async function reopenYear(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'academic_years.reopen');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_years')
    .update({ status: 'DRAFT' })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError('Annee introuvable.');
  await audit(ctx, { action: 'academic_years.reopen', module: 'academic_years', entityType: 'academic_year', entityId: id });
}

// --- Periodes -------------------------------------------------------------

export async function createPeriod(ctx: TenantContext, yearId: string, input: PeriodInput): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();

  // La periode doit tenir dans l'annee
  const { data: year } = await supabase
    .from('academic_years')
    .select('starts_on, ends_on')
    .eq('school_id', ctx.school.id)
    .eq('id', yearId)
    .maybeSingle();
  if (!year) throw new NotFoundError('Annee introuvable.');
  if (input.startsOn < year.starts_on || input.endsOn > year.ends_on) {
    throw new ValidationError("La periode doit etre comprise dans l'annee scolaire.");
  }

  const { error } = await supabase.from('academic_periods').insert({
    school_id: ctx.school.id,
    academic_year_id: yearId,
    name: input.name,
    sequence: input.sequence,
    kind: input.kind,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    is_grading_period: input.isGradingPeriod,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une periode occupe deja ce rang.');
    throw error;
  }
  await audit(ctx, { action: 'academic_periods.create', module: 'academic_years', entityType: 'academic_period', after: input });
}

export async function deletePeriod(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('academic_periods')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Cette periode est utilisee (evaluations, bulletins).');
    throw error;
  }
  if (!count) throw new NotFoundError('Periode introuvable.');
  await audit(ctx, { action: 'academic_periods.delete', module: 'academic_years', entityType: 'academic_period', entityId: id });
}
