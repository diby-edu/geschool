import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Quand un enseignant ne peut pas être mis à l'emploi du temps.
 *
 * Le générateur lisait déjà cette table (`schedule/generation.ts`), mais aucun
 * écran ne la remplissait : la contrainte existait sans jamais pouvoir être
 * exprimée. On ouvre donc la saisie.
 *
 * Deux cas, et deux seulement — les enseignants d'un lycée ne remplissent pas
 * un planning de disponibilités, ils signalent des contraintes :
 *   * INDISPONIBLE : ne pas placer de cours ici (autre établissement, soin,
 *     obligation). Le générateur s'y tient.
 *   * À ÉVITER : il préférerait ne pas, mais ce n'est pas bloquant.
 */

export const AVAILABILITY_KINDS = ['UNAVAILABLE', 'AVOID'] as const;
export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number];

export type TeacherSlotRule = {
  id: string;
  teacherId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  kind: AvailabilityKind;
  reason: string | null;
};

export async function listTeacherRules(ctx: TenantContext, teacherId: string): Promise<TeacherSlotRule[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('teacher_availability')
    .select('id, teacher_id, day_of_week, starts_at, ends_at, kind, reason')
    .eq('school_id', ctx.school.id)
    .eq('teacher_id', teacherId)
    .eq('academic_year_id', yearId)
    .in('kind', [...AVAILABILITY_KINDS])
    .order('day_of_week')
    .order('starts_at');
  return mapRules(data);
}

/** Toutes les règles de l'année : pour l'écran de synthèse et la génération. */
export async function listAllTeacherRules(ctx: TenantContext): Promise<TeacherSlotRule[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('teacher_availability')
    .select('id, teacher_id, day_of_week, starts_at, ends_at, kind, reason')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .in('kind', [...AVAILABILITY_KINDS]);
  return mapRules(data);
}

export async function createTeacherRule(
  ctx: TenantContext,
  input: { teacherId: string; dayOfWeek: number; startsAt: string; endsAt: string; kind: AvailabilityKind; reason: string },
): Promise<void> {
  requireWritable(ctx, 'teachers.manage_availability');
  const yearId = ctx.academicYear?.id;
  if (!yearId) throw new ValidationError('Activez une année scolaire d’abord.');
  if (input.endsAt <= input.startsAt) throw new ValidationError('L’heure de fin doit suivre l’heure de début.');
  if (input.dayOfWeek < 1 || input.dayOfWeek > 7) throw new ValidationError('Jour invalide.');
  if (!AVAILABILITY_KINDS.includes(input.kind)) throw new ValidationError('Type de contrainte inconnu.');

  // Deux règles qui se chevauchent sur le même jour ne se contredisent pas,
  // mais elles brouillent la lecture : on refuse le doublon exact.
  const existantes = await listTeacherRules(ctx, input.teacherId);
  const doublon = existantes.some(
    (r) => r.dayOfWeek === input.dayOfWeek && r.startsAt === input.startsAt && r.endsAt === input.endsAt,
  );
  if (doublon) throw new ValidationError('Cette plage est déjà déclarée pour cet enseignant.');

  const supabase = await createClient();
  const { error } = await supabase.from('teacher_availability').insert({
    school_id: ctx.school.id,
    teacher_id: input.teacherId,
    academic_year_id: yearId,
    day_of_week: input.dayOfWeek,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    kind: input.kind,
    reason: input.reason || null,
  });
  if (error) throw error;
  await audit(ctx, {
    action: 'teachers.availability_create',
    module: 'teachers',
    entityType: 'teacher',
    entityId: input.teacherId,
    after: input,
  });
}

export async function deleteTeacherRule(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'teachers.manage_availability');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('teacher_availability')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Contrainte introuvable.');
  await audit(ctx, { action: 'teachers.availability_delete', module: 'teachers', entityType: 'teacher', entityId: id });
}

function mapRules(data: unknown): TeacherSlotRule[] {
  return ((data ?? []) as {
    id: string;
    teacher_id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    kind: string;
    reason: string | null;
  }[]).map((r) => ({
    id: r.id,
    teacherId: r.teacher_id,
    dayOfWeek: r.day_of_week,
    startsAt: r.starts_at.slice(0, 5),
    endsAt: r.ends_at.slice(0, 5),
    kind: (AVAILABILITY_KINDS.includes(r.kind as AvailabilityKind) ? r.kind : 'UNAVAILABLE') as AvailabilityKind,
    reason: r.reason,
  }));
}
