import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { getConfig, getConfigForClass, listCyclesOverview } from './config';
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
  /** « R:<uuid> » ou « T:<uuid> » : la cible de la règle, quel que soit le mode. */
  room_target: string;
  min_capacity: number | null;
  required_features: string[];
  status: string;
};

// Une exigence par cours et par classe : un lycee de 5 000 eleves en compte
// pres d'un millier. Au-dela de 1 000 lignes PostgREST tronque la reponse sans
// rien dire, et une seule requete de cette taille avec ses relations depasse
// le statement_timeout. Lecture par curseur, comme les seances.
const REQUIREMENTS_PAGE_SIZE = 200;

/** Exigences pedagogiques de l'annee, pretes a afficher. */
export async function listRequirements(ctx: TenantContext, yearId: string): Promise<RequirementRow[]> {
  const supabase = await createClient();
  type Raw = { id: string; created_at: string };
  const data = await fetchAllRows<Raw>((cursor) => {
    let q = supabase
      .from('teaching_requirements')
      .select(
        'id, created_at, weekly_minutes, sessions_count, session_duration_minutes, room_requirement_mode, status, ' +
          'required_room_id, required_room_type_id, preferred_room_id, preferred_room_type_id, ' +
          'min_capacity, required_features, ' +
          'subjects(name), ' +
          'teaching_requirement_targets(target_type, classes(name), groups(name)), ' +
          'teaching_requirement_teachers(teachers(first_name, last_name))',
      )
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(REQUIREMENTS_PAGE_SIZE);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>;
  }, REQUIREMENTS_PAGE_SIZE);
  // L'ordre voulu a l'ecran est celui de creation ; il s'applique apres la
  // lecture complete, le curseur imposant le tri par id.
  data.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  return (data as unknown as {
    id: string;
    weekly_minutes: number;
    sessions_count: number;
    session_duration_minutes: number | null;
    room_requirement_mode: string;
    required_room_id: string | null;
    required_room_type_id: string | null;
    preferred_room_id: string | null;
    preferred_room_type_id: string | null;
    min_capacity: number | null;
    required_features: string[] | null;
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
    room_target:
      r.required_room_id !== null
        ? `R:${r.required_room_id}`
        : r.preferred_room_id !== null
          ? `R:${r.preferred_room_id}`
          : r.required_room_type_id !== null
            ? `T:${r.required_room_type_id}`
            : r.preferred_room_type_id !== null
              ? `T:${r.preferred_room_type_id}`
              : '',
    min_capacity: r.min_capacity,
    required_features: r.required_features ?? [],
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

  // Pas de grille par defaut exigee : un etablissement entierement decoupe en
  // cycles (§ decision "pause par cycle") n'en a jamais — chaque classe
  // resout la sienne plus bas (getConfigForClass). On ne bloque que si
  // AUCUNE grille n'existe nulle part.
  const config = await getConfig(ctx, yearId);
  const defaultSlotMinutes = config?.default_session_minutes;
  if (!config) {
    const cycles = await listCyclesOverview(ctx, yearId);
    if (!cycles.some((c) => c.configId)) throw new ValidationError('Configurez d\'abord la grille horaire.');
  }

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
    // Un enseignement dont la classe releve d'un cycle a grille propre (§
    // decision "pause par cycle") se decoupe selon la duree de creneau de
    // CETTE grille, pas celle de l'annee — sinon un cycle a creneaux de 45 min
    // recevrait des exigences taillees pour des creneaux de 55.
    const slotMinutes = a.class_id
      ? (await getConfigForClass(ctx, yearId, a.class_id))?.default_session_minutes ?? defaultSlotMinutes
      : defaultSlotMinutes;
    if (!slotMinutes) { skipped++; continue; } // ni grille de classe, ni grille par defaut : rien a convertir
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
    .update(
      {
        sessions_count: input.sessionsCount,
        session_duration_minutes: input.sessionDurationMinutes,
        min_capacity: input.minCapacity ?? null,
        required_features: input.requiredFeatures,
        status: input.status,
        ...roomRuleColumns(input.roomMode, input.roomTarget ?? ''),
      },
      { count: 'exact' },
    )
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

/**
 * Traduit « mode + cible » en colonnes. Les quatre colonnes de salle sont
 * remises à zéro à chaque enregistrement : une règle en remplace une autre,
 * elles ne s'empilent jamais (la contrainte 0069 l'exige, et c'est plus clair).
 */
function roomRuleColumns(
  mode: string,
  target: string,
): {
  room_requirement_mode: 'NONE' | 'PREFERRED' | 'REQUIRED_ROOM' | 'REQUIRED_TYPE';
  required_room_id: string | null;
  required_room_type_id: string | null;
  preferred_room_id: string | null;
  preferred_room_type_id: string | null;
} {
  const empty = {
    required_room_id: null,
    required_room_type_id: null,
    preferred_room_id: null,
    preferred_room_type_id: null,
  };
  const kind = target.startsWith('R:') ? 'ROOM' : target.startsWith('T:') ? 'TYPE' : null;
  const id = kind ? target.slice(2) : null;

  if (mode === 'NONE' || !kind || !id) return { room_requirement_mode: 'NONE', ...empty };
  if (mode === 'PREFERRED') {
    return kind === 'ROOM'
      ? { room_requirement_mode: 'PREFERRED', ...empty, preferred_room_id: id }
      : { room_requirement_mode: 'PREFERRED', ...empty, preferred_room_type_id: id };
  }
  // Obligatoire : le mode suit la nature de la cible, pas l'inverse.
  return kind === 'ROOM'
    ? { room_requirement_mode: 'REQUIRED_ROOM', ...empty, required_room_id: id }
    : { room_requirement_mode: 'REQUIRED_TYPE', ...empty, required_room_type_id: id };
}
