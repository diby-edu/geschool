import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { getConfig } from './config';
import type { RequirementInput } from './schemas';

export type RequirementRow = {
  id: string;
  subject: string;
  target: string;
  teachers: string;
  weekly_minutes: number;
  sessions_count: number;
  session_duration_minutes: number | null;
  room_mode: string;
  status: string;
};

/** Exigences pedagogiques de l'annee, pretes a afficher. */
export async function listRequirements(ctx: TenantContext, yearId: string): Promise<RequirementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teaching_requirements')
    .select(
      'id, weekly_minutes, sessions_count, session_duration_minutes, room_requirement_mode, status, ' +
        'subjects(name), ' +
        'teaching_requirement_targets(target_type, classes(name), groups(name)), ' +
        'teaching_requirement_teachers(teachers(first_name, last_name))',
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    weekly_minutes: number;
    sessions_count: number;
    session_duration_minutes: number | null;
    room_requirement_mode: string;
    status: string;
    subjects: { name: string } | null;
    teaching_requirement_targets: {
      target_type: string;
      classes: { name: string } | null;
      groups: { name: string } | null;
    }[];
    teaching_requirement_teachers: { teachers: { first_name: string; last_name: string } | null }[];
  }[]).map((r) => ({
    id: r.id,
    subject: r.subjects?.name ?? '—',
    target: r.teaching_requirement_targets
      .map((t) => (t.target_type === 'CLASS' ? t.classes?.name : t.groups?.name) ?? '—')
      .join(' + ') || '—',
    teachers: r.teaching_requirement_teachers
      .map((t) => (t.teachers ? `${t.teachers.last_name.toUpperCase()} ${t.teachers.first_name}` : '—'))
      .join(', ') || '—',
    weekly_minutes: r.weekly_minutes,
    sessions_count: r.sessions_count,
    session_duration_minutes: r.session_duration_minutes,
    room_mode: r.room_requirement_mode,
    status: r.status,
  }));
}

/**
 * Materialise les exigences a partir des affectations pedagogiques
 * (docs/DATABASE.md §7). Une exigence deja liee a une affectation est PRESERVEE
 * (les reglages manuels du directeur ne sont pas ecrases) ; seules les
 * affectations sans exigence en produisent une nouvelle.
 *
 * Le nombre de seances est deduit du volume hebdomadaire et de la duree de
 * creneau de la grille : une matiere de 240 min sur des creneaux de 60 min
 * donne 4 seances d'un creneau. Le directeur ajuste ensuite librement (§22).
 */
export async function syncRequirementsFromAssignments(
  ctx: TenantContext,
  yearId: string,
): Promise<{ created: number; skipped: number }> {
  requireWritable(ctx, 'schedule.create');
  const supabase = await createClient();

  const config = await getConfig(ctx, yearId);
  if (!config) throw new ValidationError('Configurez d\'abord la grille horaire.');
  const slotMinutes = config.default_session_minutes;

  const { data: assignments, error } = await supabase
    .from('teaching_assignments')
    .select('id, teacher_id, subject_id, class_id, group_id, weekly_minutes')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  if (error) throw error;

  const active = (assignments ?? []).filter((a) => a.weekly_minutes > 0 && (a.class_id || a.group_id));
  if (active.length === 0) {
    throw new ValidationError('Aucune affectation avec un volume horaire a convertir.');
  }

  // Exigences existantes deja liees a une affectation : a ne pas recreer.
  const { data: existing } = await supabase
    .from('teaching_requirements')
    .select('teaching_assignment_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .not('teaching_assignment_id', 'is', null);
  const linked = new Set((existing ?? []).map((e) => e.teaching_assignment_id));

  let created = 0;
  let skipped = 0;
  for (const a of active) {
    if (linked.has(a.id)) {
      skipped++;
      continue;
    }
    const sessions = Math.max(1, Math.round(a.weekly_minutes / slotMinutes));
    const duration = Math.max(slotMinutes, Math.round(a.weekly_minutes / sessions / slotMinutes) * slotMinutes);

    const { data: req, error: reqErr } = await supabase
      .from('teaching_requirements')
      .insert({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        subject_id: a.subject_id,
        teaching_assignment_id: a.id,
        weekly_minutes: a.weekly_minutes,
        sessions_count: sessions,
        session_duration_minutes: duration,
        room_requirement_mode: 'NONE',
        status: 'ACTIVE',
      })
      .select('id')
      .single();
    if (reqErr) throw reqErr;

    await supabase.from('teaching_requirement_targets').insert({
      school_id: ctx.school.id,
      requirement_id: req.id,
      target_type: a.class_id ? 'CLASS' : 'GROUP',
      class_id: a.class_id,
      group_id: a.group_id,
    });
    await supabase.from('teaching_requirement_teachers').insert({
      school_id: ctx.school.id,
      requirement_id: req.id,
      teacher_id: a.teacher_id,
      role: 'LEAD',
    });
    created++;
  }

  await audit(ctx, {
    action: 'schedule.requirements_sync',
    module: 'schedule',
    entityType: 'teaching_requirement',
    after: { created, skipped },
  });
  return { created, skipped };
}

export async function updateRequirement(ctx: TenantContext, id: string, input: RequirementInput): Promise<void> {
  requireWritable(ctx, 'schedule.update');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('teaching_requirements')
    .update({
      sessions_count: input.sessionsCount,
      session_duration_minutes: input.sessionDurationMinutes,
      room_requirement_mode: input.roomMode,
      status: input.status,
    }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Exigence introuvable.');
  await audit(ctx, { action: 'schedule.requirement_update', module: 'schedule', entityType: 'teaching_requirement', entityId: id, after: input });
}

export async function deleteRequirement(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('teaching_requirements')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Exigence introuvable.');
  await audit(ctx, { action: 'schedule.requirement_delete', module: 'schedule', entityType: 'teaching_requirement', entityId: id });
}
