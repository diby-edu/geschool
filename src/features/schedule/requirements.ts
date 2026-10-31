import 'server-only';
import { COURSE_HOUR_MINUTES } from '@/features/programme/hours';
import { coursePlan, describeBlocks, totalHours } from './blocks';

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
  /** Durée de chaque cours de la semaine, en heures. */
  blocks: number[];
  room_mode: string;
  /** « R:<uuid> » ou « T:<uuid> » : la cible de la règle, quel que soit le mode. */
  room_target: string;
  min_capacity: number | null;
  required_features: string[];
  status: string;
  subject_id: string;
  /** Classes du cours (une en général ; plusieurs pour un cours commun). */
  classes: { id: string; name: string; level_id: string | null; level_name: string | null; level_sequence: number; main_room_id: string | null }[];
  teacher_ids: string[];
  /** Matricules, dans le même ordre : deux homonymes se distinguent par lui. */
  teacher_numbers: string[];
  /** Affectation d'origine (synchronisation) : son volume suit le programme. */
  assignment_id: string | null;
  room_ids: { required_room: string | null; required_type: string | null; preferred_room: string | null; preferred_type: string | null };
};

// Une exigence par cours et par classe : un lycee de 5 000 eleves en compte
// pres d'un millier. Au-dela de 1 000 lignes PostgREST tronque la reponse sans
// rien dire, et une seule requete de cette taille avec ses relations depasse
// le statement_timeout. Lecture par curseur, comme les seances.
// 500 : deux lectures pour un grand lycée (mesuré le 2026-10-31 : 5 paquets de 200 = 2,2 s).
const REQUIREMENTS_PAGE_SIZE = 500;

/** Exigences pedagogiques de l'annee, pretes a afficher. */
export async function listRequirements(ctx: TenantContext, yearId: string): Promise<RequirementRow[]> {
  const supabase = await createClient();
  type Raw = { id: string; created_at: string };
  // Une lecture, droits vérifiés une fois (requirements_overview, 0165) ; avant
  // la migration, la lecture par paquets ci-dessous.
  const grouped = await supabase.rpc('requirements_overview' as never, { p_school: ctx.school.id, p_year: yearId } as never);
  if (grouped.error && grouped.error.code !== 'PGRST202' && grouped.error.code !== '42883') throw grouped.error;
  const data = !grouped.error ? ((grouped.data ?? []) as unknown as Raw[]) : await fetchAllRows<Raw>((cursor) => {
    let q = supabase
      .from('teaching_requirements')
      .select(
        'id, created_at, weekly_minutes, sessions_count, session_duration_minutes, block_hours, room_requirement_mode, status, ' +
          'required_room_id, required_room_type_id, preferred_room_id, preferred_room_type_id, ' +
          'min_capacity, required_features, ' +
          'subject_id, teaching_assignment_id, subjects(name), ' +
          'teaching_requirement_targets(target_type, class_id, classes(name, level_id, main_room_id, levels(name, sequence)), groups(name)), ' +
          'teaching_requirement_teachers(teacher_id, teachers(first_name, last_name, staff_number))',
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
    block_hours: number[] | null;
    room_requirement_mode: string;
    required_room_id: string | null;
    required_room_type_id: string | null;
    preferred_room_id: string | null;
    preferred_room_type_id: string | null;
    min_capacity: number | null;
    required_features: string[] | null;
    status: string;
    subject_id: string;
    teaching_assignment_id: string | null;
    subjects: { name: string } | null;
    teaching_requirement_targets: {
      target_type: string;
      class_id: string | null;
      classes: { name: string; level_id: string | null; main_room_id: string | null; levels: { name: string; sequence: number } | null } | null;
      groups: { name: string } | null;
    }[];
    teaching_requirement_teachers: { teacher_id: string; teachers: { first_name: string; last_name: string; staff_number: string | null } | null }[];
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
    // Les cours de la semaine, en heures : « 4 h + 2 h », « 3 cours de 2 h ».
    blocks: coursePlan({
      blockHours: r.block_hours,
      sessionsCount: r.sessions_count,
      sessionDurationMinutes: r.session_duration_minutes,
      weeklyMinutes: r.weekly_minutes,
    }),
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
    subject_id: r.subject_id,
    classes: r.teaching_requirement_targets
      .filter((t) => t.target_type === 'CLASS' && t.class_id && t.classes)
      .map((t) => ({
        id: t.class_id!,
        name: t.classes!.name,
        level_id: t.classes!.level_id,
        level_name: t.classes!.levels?.name ?? null,
        level_sequence: t.classes!.levels?.sequence ?? 999,
        main_room_id: t.classes!.main_room_id,
      })),
    teacher_ids: r.teaching_requirement_teachers.map((t) => t.teacher_id),
    teacher_numbers: r.teaching_requirement_teachers.map((t) => t.teachers?.staff_number ?? ''),
    assignment_id: r.teaching_assignment_id,
    room_ids: {
      required_room: r.required_room_id,
      required_type: r.required_room_type_id,
      preferred_room: r.preferred_room_id,
      preferred_type: r.preferred_room_type_id,
    },
  }));
}

/** Colonnes d'un découpage : nombre de cours, durée de chacun (si tous égaux), total. */
function blockColumns(blocks: number[]) {
  return {
    block_hours: blocks,
    sessions_count: blocks.length,
    session_duration_minutes: blocks.every((b) => b === blocks[0]) ? blocks[0]! * COURSE_HOUR_MINUTES : null,
    weekly_minutes: totalHours(blocks) * COURSE_HOUR_MINUTES,
  };
}

/**
 * Change le seul découpage d'un enseignement. Le total ne bouge pas : il vient du
 * programme (« 4 h de maths en 3e »). Un découpage qui ne tombe pas juste est
 * refusé avec le bon chiffre, plutôt que de changer les heures en douce.
 */
export async function updateRequirementBlocks(ctx: TenantContext, id: string, blocks: number[]): Promise<void> {
  requireWritable(ctx, 'schedule.update');
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('teaching_requirements')
    .select('weekly_minutes')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new NotFoundError('Enseignement introuvable.');
  const hours = Math.round(row.weekly_minutes / COURSE_HOUR_MINUTES);
  if (totalHours(blocks) !== hours) {
    throw new ValidationError(`${blocks.join('+')} = ${totalHours(blocks)} h, mais ce cours a ${hours} h par semaine. Changez le volume dans Programme si besoin.`);
  }
  const { error } = await supabase.from('teaching_requirements').update(blockColumns(blocks)).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'schedule.requirement_blocks', module: 'schedule', entityType: 'teaching_requirement', entityId: id, after: { blocks } });
}

/**
 * « Découper en une fois » : le même découpage pour une matière dans toutes les
 * classes d'un niveau. Seuls les enseignements dont le volume correspond sont
 * changés ; les autres sont comptés et signalés (ex. une classe à 5 h).
 */
export async function applyBlocksToLevel(
  ctx: TenantContext,
  yearId: string,
  subjectId: string,
  levelId: string,
  blocks: number[],
): Promise<{ changed: number; skipped: number; label: string }> {
  requireWritable(ctx, 'schedule.update');
  const rows = (await listRequirements(ctx, yearId)).filter(
    (r) => r.subject_id === subjectId && r.classes.length === 1 && r.classes[0]!.level_id === levelId,
  );
  if (rows.length === 0) throw new ValidationError("Cette matière n'a aucun enseignement dans ce niveau.");
  const minutes = totalHours(blocks) * COURSE_HOUR_MINUTES;
  const fits = rows.filter((r) => r.weekly_minutes === minutes).map((r) => r.id);
  if (fits.length === 0) {
    const hours = [...new Set(rows.map((r) => Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES)))].join(' ou ');
    throw new ValidationError(`${blocks.join('+')} = ${totalHours(blocks)} h, mais cette matière a ${hours} h par semaine dans ce niveau.`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from('teaching_requirements').update(blockColumns(blocks)).eq('school_id', ctx.school.id).in('id', fits);
  if (error) throw error;
  await audit(ctx, {
    action: 'schedule.requirement_blocks_bulk',
    module: 'schedule',
    entityType: 'teaching_requirement',
    after: { subjectId, levelId, blocks, changed: fits.length, skipped: rows.length - fits.length },
  });
  return { changed: fits.length, skipped: rows.length - fits.length, label: describeBlocks(blocks) };
}

export type ProgrammeDrift = {
  /** « Mathématiques · 3ème » */
  label: string;
  fromHours: number;
  toHours: number;
  ids: string[];
};

/**
 * Enseignements dont le volume ne suit plus le programme : le volume est recopié
 * à l'affectation, puis le programme a pu changer (constaté le 2026-10-30 : un
 * changement de programme n'arrivait jamais jusqu'à l'emploi du temps).
 */
/** Volumes du programme, « niveau:matière » → minutes par semaine. */
export async function loadProgrammeMinutes(ctx: TenantContext): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from('level_subjects').select('level_id, subject_id, weekly_minutes').eq('school_id', ctx.school.id);
  return new Map(((data ?? []) as { level_id: string; subject_id: string; weekly_minutes: number }[]).map((p) => [`${p.level_id}:${p.subject_id}`, p.weekly_minutes]));
}

export function programmeDrift(rows: RequirementRow[], programme: Map<string, number>): ProgrammeDrift[] {
  const groups = new Map<string, ProgrammeDrift>();
  for (const r of rows) {
    if (!r.assignment_id || r.classes.length !== 1) continue;
    const c = r.classes[0]!;
    const want = programme.get(`${c.level_id}:${r.subject_id}`);
    if (!want || want === r.weekly_minutes) continue;
    const key = `${c.level_id}:${r.subject_id}:${r.weekly_minutes}`;
    const g = groups.get(key) ?? {
      label: `${r.subject} · ${c.level_name ?? '?'}`,
      fromHours: Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES),
      toHours: Math.round(want / COURSE_HOUR_MINUTES),
      ids: [],
    };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/**
 * Remet au volume du programme les enseignements en écart, et leurs affectations.
 * Le découpage de ces cours repart en cours d'1 h : l'ancien ne tombe plus juste.
 */
export async function alignWithProgramme(ctx: TenantContext, yearId: string): Promise<number> {
  requireWritable(ctx, 'schedule.update');
  const [rows, programme] = await Promise.all([listRequirements(ctx, yearId), loadProgrammeMinutes(ctx)]);
  const drifts = programmeDrift(rows, programme);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const supabase = await createClient();
  let changed = 0;
  for (const d of drifts) {
    const blocks = Array.from({ length: d.toHours }, () => 1);
    const { error } = await supabase.from('teaching_requirements').update(blockColumns(blocks)).eq('school_id', ctx.school.id).in('id', d.ids);
    if (error) throw error;
    const assignments = d.ids.map((id) => byId.get(id)?.assignment_id).filter((a): a is string => Boolean(a));
    if (assignments.length > 0) {
      const { error: aErr } = await supabase
        .from('teaching_assignments')
        .update({ weekly_minutes: d.toHours * COURSE_HOUR_MINUTES })
        .eq('school_id', ctx.school.id)
        .in('id', assignments);
      if (aErr) throw aErr;
    }
    changed += d.ids.length;
  }
  await audit(ctx, { action: 'schedule.requirements_align_programme', module: 'schedule', entityType: 'teaching_requirement', after: { changed } });
  return changed;
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
    // 1 cours = 1 heure : « 6 h » = 6 cours d'un créneau, que le créneau dure
    // 55 ou 60 minutes. (Avant : 360 min / 55 = 6,5 -> 7 cours, un de trop.)
    const sessions = Math.max(1, Math.round(a.weekly_minutes / COURSE_HOUR_MINUTES));
    const duration = slotMinutes;

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
        // Le découpage fait foi : nombre de cours, durée de chacun, total.
        block_hours: input.blocks,
        sessions_count: input.blocks.length,
        session_duration_minutes: input.blocks.every((b) => b === input.blocks[0]) ? input.blocks[0]! * COURSE_HOUR_MINUTES : null,
        weekly_minutes: totalHours(input.blocks) * COURSE_HOUR_MINUTES,
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
