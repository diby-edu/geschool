import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { AcademicYearInput, CalendarEventInput, PeriodEditInput, PeriodInput } from './schemas';
import { officialCalendarFor, officialScopes, officialBreakName } from './official-calendar-ci';
import { schoolTracks } from '@/features/structure/queries';
import { findOverlap } from './overlap';
import { parseTracks } from './periods-by-track';
import type { EducationTrack } from '@/features/structure/official-tracks';

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
    if (error.code === '23505') throw new ConflictError('Une année porte déjà ce nom.');
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
    if (error.code === '23505') throw new ConflictError('Une année porte déjà ce nom.');
    throw error;
  }
  if (!data) throw new NotFoundError('Année introuvable.');
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
  if (!data) throw new NotFoundError('Année introuvable.');
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
  if (!data) throw new NotFoundError('Année introuvable.');
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
  if (!data) throw new NotFoundError('Année introuvable.');
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
  if (!year) throw new NotFoundError('Année introuvable.');
  if (input.startsOn < year.starts_on || input.endsOn > year.ends_on) {
    throw new ValidationError("La période doit être comprise dans l'année scolaire.");
  }
  await assertNoPeriodOverlap(ctx, yearId, input.startsOn, input.endsOn, null, parseTracks(input.track));

  const { error } = await supabase.from('academic_periods').insert({
    school_id: ctx.school.id,
    academic_year_id: yearId,
    name: input.name,
    sequence: input.sequence,
    kind: input.kind,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    is_grading_period: input.isGradingPeriod,
    tracks: parseTracks(input.track),
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une période occupe déjà ce rang.');
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
    if (error.code === '23503') throw new ConflictError('Cette période est utilisée (évaluations, bulletins).');
    throw error;
  }
  if (!count) throw new NotFoundError('Période introuvable.');
  await audit(ctx, { action: 'academic_periods.delete', module: 'academic_years', entityType: 'academic_period', entityId: id });
}

/**
 * Fenetre de calcul des moyennes d'une periode : dates de debut et de fin (les deux
 * ou aucune). Elle se ferme d'elle-meme a la date de fin ; voir `setGradingOverride`
 * pour l'ouvrir ou la fermer a la main.
 */
export async function setGradingWindow(ctx: TenantContext, periodId: string, startsOn: string | null, endsOn: string | null): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  if (Boolean(startsOn) !== Boolean(endsOn)) {
    throw new ValidationError('Renseignez les deux dates de la période de calcul, ou aucune.');
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new ValidationError('La fin de la période de calcul doit suivre son début.');
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_periods')
    .update({ grading_starts_on: startsOn, grading_ends_on: endsOn })
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Période introuvable.');
  await audit(ctx, { action: 'academic_periods.grading_window', module: 'academic_years', entityType: 'academic_period', entityId: periodId, after: { startsOn, endsOn } });
}

/** Ouverture (OPEN) ou fermeture (CLOSED) manuelle de la periode de calcul ; null = retour au mode automatique (dates). */
export async function setGradingOverride(ctx: TenantContext, periodId: string, mode: 'OPEN' | 'CLOSED' | null): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_periods')
    .update({ grading_override: mode })
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Période introuvable.');
  await audit(ctx, { action: 'academic_periods.grading_override', module: 'academic_years', entityType: 'academic_period', entityId: periodId, after: { mode } });
}

// --- Calendrier : congés, jours fériés, fermetures ----------------------------

async function loadEditableYear(ctx: TenantContext, yearId: string) {
  const supabase = await createClient();
  const { data: year } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, status')
    .eq('school_id', ctx.school.id)
    .eq('id', yearId)
    .maybeSingle();
  if (!year) throw new NotFoundError('Année introuvable.');
  if (year.status !== 'DRAFT' && year.status !== 'ACTIVE') {
    throw new ValidationError('Cette année est clôturée : son calendrier ne se modifie plus.');
  }
  return year;
}

/**
 * Congé ou jour férié. S'il bloque l'emploi du temps, les séances déjà prévues
 * ces jours-là sont annulées par la base (déclencheur, migration 0062) : aucun
 * appel n'y est attendu.
 */
export async function createCalendarEvent(ctx: TenantContext, yearId: string, input: CalendarEventInput): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  await loadEditableYear(ctx, yearId);
  const supabase = await createClient();
  const { error } = await supabase.from('school_calendar_events').insert({
    school_id: ctx.school.id,
    academic_year_id: yearId,
    kind: input.kind,
    name: input.name,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    blocks_schedule: input.blocksSchedule,
    tracks: parseTracks(input.track),
  });
  if (error) throw error;
  await audit(ctx, { action: 'calendar_events.create', module: 'academic_years', entityType: 'school_calendar_event', after: input });
}

export async function deleteCalendarEvent(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('school_calendar_events')
    .delete()
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id, name');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Événement introuvable.');
  await audit(ctx, { action: 'calendar_events.delete', module: 'academic_years', entityType: 'school_calendar_event', entityId: id, before: { name: data[0]!.name } });
}

export type OfficialCalendarResult = { periodsCreated: number; periodsUpdated: number; breaksCreated: number; breaksUpdated: number };

const frDate = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Applique le calendrier officiel (trimestres et congés) à une année. Rejouable :
 * un trimestre du même rang reçoit les dates officielles, un congé du même nom
 * aussi ; rien n'est supprimé (un jour férié ajouté à la main reste en place).
 */
export async function applyOfficialCalendar(ctx: TenantContext, yearId: string): Promise<OfficialCalendarResult> {
  requireWritable(ctx, 'academic_years.manage');
  const year = await loadEditableYear(ctx, yearId);
  const official = officialCalendarFor(year.name);
  if (!official) throw new ValidationError(`Aucun calendrier officiel connu pour l’année « ${year.name} ».`);

  // Ce qu'on pose dépend des ordres d'enseignement de l'établissement : trimestres
  // pour le général, semestres pour le technique et le professionnel. Quand
  // l'école n'a qu'un seul découpage, ses périodes valent pour toute l'école
  // (tracks null) — inutile de préciser un ordre partout.
  const schoolOrders = await schoolTracks(ctx);
  const { hasGeneral, techPro, generalScope, techScope, generalSuffix, techSuffix } = officialScopes(schoolOrders);

  const wanted = [...(hasGeneral ? official.periods : []), ...(techPro.length > 0 ? official.semesters : [])];
  const firstDay = wanted.reduce((m, p) => (p.startsOn < m ? p.startsOn : m), wanted[0]!.startsOn);
  const lastDay = wanted.reduce((m, p) => (p.endsOn > m ? p.endsOn : m), wanted[0]!.endsOn);
  if (firstDay < year.starts_on || lastDay > year.ends_on) {
    throw new ValidationError(
      `Le découpage officiel va du ${frDate(firstDay)} au ${frDate(lastDay)} : élargissez d’abord les dates de l’année (section « Informations »).`,
    );
  }

  const supabase = await createClient();
  const result: OfficialCalendarResult = { periodsCreated: 0, periodsUpdated: 0, breaksCreated: 0, breaksUpdated: 0 };

  const { data: periods, error: periodsError } = await supabase
    .from('academic_periods')
    .select('id, sequence, starts_on, ends_on, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  if (periodsError) throw periodsError;

  const sameScope = (rowTracks: string[] | null, scope: EducationTrack[] | null, adoptCommon: boolean) => {
    if (!rowTracks || rowTracks.length === 0) return adoptCommon;
    if (!scope) return false;
    return rowTracks.length === scope.length && scope.every((t) => rowTracks.includes(t));
  };

  /** Pose un découpage : un rang déjà présent reçoit les dates officielles, les autres sont créés. */
  const applyPeriods = async (
    list: typeof official.periods,
    kind: 'TERM' | 'SEMESTER',
    scope: EducationTrack[] | null,
    adoptCommon: boolean,
  ) => {
    const mine = (periods ?? []).filter((p) =>
      sameScope((p as { tracks?: string[] | null }).tracks ?? null, scope, adoptCommon),
    );
    const bySeq = new Map(mine.map((p) => [p.sequence, p]));
    const missing = list.filter((p) => !bySeq.has(p.sequence));
    if (missing.length > 0) {
      // Une seule insertion : la base ne recalcule les séances de l'année qu'une fois (déclencheur 0063).
      const { error } = await supabase.from('academic_periods').insert(
        missing.map((p) => ({
          school_id: ctx.school.id,
          academic_year_id: yearId,
          name: p.name,
          sequence: p.sequence,
          kind,
          starts_on: p.startsOn,
          ends_on: p.endsOn,
          is_grading_period: true,
          tracks: scope,
        })),
      );
      if (error) throw error;
      result.periodsCreated += missing.length;
    }
    for (const p of list) {
      const existing = bySeq.get(p.sequence);
      if (!existing) continue;
      const rowTracks = (existing as { tracks?: string[] | null }).tracks ?? null;
      const needsScope = scope !== null && (rowTracks === null || rowTracks.length === 0);
      if (existing.starts_on === p.startsOn && existing.ends_on === p.endsOn && !needsScope) continue;
      const { error } = await supabase
        .from('academic_periods')
        .update({ starts_on: p.startsOn, ends_on: p.endsOn, ...(needsScope ? { tracks: scope } : {}) })
        .eq('school_id', ctx.school.id)
        .eq('id', existing.id);
      if (error) throw error;
      result.periodsUpdated++;
    }
  };

  // Les trimestres existants (sans ordre) sont ceux du général : on les reprend.
  if (hasGeneral) await applyPeriods(official.periods, 'TERM', generalScope, true);
  if (techPro.length > 0) await applyPeriods(official.semesters, 'SEMESTER', techScope, !hasGeneral);

  // Congés, par nom. Les jours fériés valent pour toute l'école ; les vacances
  // diffèrent d'un ordre à l'autre, donc leur nom précise qui elles concernent.
  const { data: events, error: eventsError } = await supabase
    .from('school_calendar_events')
    .select('id, name, starts_on, ends_on, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  if (eventsError) throw eventsError;
  const byName = new Map((events ?? []).map((e) => [e.name.toLowerCase(), e]));

  /**
   * Pose les congés d'un calendrier. `adoptLegacy` : l'établissement avait déjà
   * appliqué le calendrier quand il n'avait qu'un ordre ; ses congés portent donc
   * le nom nu (« Congés de Toussaint »). On les reprend — on les renomme et on
   * leur donne leur portée — au lieu d'en créer un deuxième à côté. Seule la
   * passe du général les adopte : ce sont ses dates qu'ils portaient.
   */
  const applyBreaks = async (
    list: typeof official.breaks,
    scope: EducationTrack[] | null,
    suffix: string,
    adoptLegacy: boolean,
  ) => {
    for (const b of list) {
      const scoped = b.kind === 'VACATION' ? scope : null;
      const name = officialBreakName(b.name, b.kind, suffix);
      const key = name.toLowerCase();
      const legacyKey = b.name.toLowerCase();
      const existing = byName.get(key) ?? (adoptLegacy && key !== legacyKey ? byName.get(legacyKey) : undefined);

      if (!existing) {
        const { error } = await supabase.from('school_calendar_events').insert({
          school_id: ctx.school.id,
          academic_year_id: yearId,
          kind: b.kind,
          name,
          starts_on: b.startsOn,
          ends_on: b.endsOn,
          blocks_schedule: true,
          tracks: scoped,
        });
        if (error) throw error;
        byName.set(key, { id: '', name, starts_on: b.startsOn, ends_on: b.endsOn, tracks: scoped });
        result.breaksCreated++;
        continue;
      }
      if (!existing.id) continue;

      const renamed = existing.name !== name;
      const rescoped = scoped !== null && ((existing as { tracks?: string[] | null }).tracks ?? null) === null;
      const redated = existing.starts_on !== b.startsOn || existing.ends_on !== b.endsOn;
      if (!renamed && !rescoped && !redated) continue;

      const { error } = await supabase
        .from('school_calendar_events')
        .update({
          ...(renamed ? { name } : {}),
          ...(rescoped ? { tracks: scoped } : {}),
          starts_on: b.startsOn,
          ends_on: b.endsOn,
        })
        .eq('school_id', ctx.school.id)
        .eq('id', existing.id);
      if (error) throw error;
      // Le congé adopté ne doit plus servir à la passe suivante.
      byName.delete(legacyKey);
      byName.set(key, { ...existing, name, starts_on: b.startsOn, ends_on: b.endsOn, tracks: scoped });
      result.breaksUpdated++;
    }
  };

  // Le nom dit qui est concerné, et seulement quand deux calendriers coexistent :
  // « Congés de Toussaint (technique) » dans une école générale + technique.
  if (hasGeneral) await applyBreaks(official.breaks, generalScope, generalSuffix, true);
  if (techPro.length > 0) await applyBreaks(official.technicalBreaks, techScope, techSuffix, !hasGeneral);

  await audit(ctx, { action: 'academic_years.official_calendar', module: 'academic_years', entityType: 'academic_year', entityId: yearId, after: { ...result, source: official.source } });
  return result;
}

/** Deux périodes d'une même année ne se chevauchent pas (bulletins, moyennes, tableau de bord). */
async function assertNoPeriodOverlap(
  ctx: TenantContext,
  yearId: string,
  startsOn: string,
  endsOn: string,
  exceptId: string | null,
  tracks: string[] | null,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_periods')
    .select('id, name, starts_on, ends_on, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  if (error) throw error;
  // Un semestre du technique et un trimestre du général se recouvrent par nature :
  // ce n'est un conflit que si les deux valent pour un même ordre.
  const concerned = (data ?? []).filter((p) => {
    const other = (p as { tracks?: string[] | null }).tracks ?? null;
    if (!tracks || !other) return true;
    return other.some((t) => tracks.includes(t));
  });
  const clash = findOverlap(concerned, startsOn, endsOn, exceptId);
  if (clash) {
    throw new ValidationError(`Ces dates chevauchent « ${clash.name} » (du ${frDate(clash.starts_on)} au ${frDate(clash.ends_on)}).`);
  }
}

/**
 * Nom, type et dates d'une période — possible même quand elle porte déjà des
 * évaluations ou des bulletins (on ne peut plus la supprimer). Son rang ne change
 * pas. La fenêtre de calcul des moyennes doit rester dans les nouvelles dates.
 */
export async function updatePeriod(ctx: TenantContext, periodId: string, input: PeriodEditInput): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data: period } = await supabase
    .from('academic_periods')
    .select('id, academic_year_id, grading_starts_on, grading_ends_on')
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .maybeSingle();
  if (!period) throw new NotFoundError('Période introuvable.');
  const year = await loadEditableYear(ctx, period.academic_year_id);
  if (input.startsOn < year.starts_on || input.endsOn > year.ends_on) {
    throw new ValidationError("La période doit être comprise dans l'année scolaire.");
  }
  await assertNoPeriodOverlap(ctx, period.academic_year_id, input.startsOn, input.endsOn, periodId, parseTracks(input.track));
  if (period.grading_starts_on && period.grading_ends_on && (period.grading_starts_on < input.startsOn || period.grading_ends_on > input.endsOn)) {
    throw new ValidationError(
      `Le calcul des moyennes de cette période est prévu du ${frDate(period.grading_starts_on)} au ${frDate(period.grading_ends_on)}, hors de ces dates : modifiez-le d’abord.`,
    );
  }

  const { data, error } = await supabase
    .from('academic_periods')
    .update({
      name: input.name,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      is_grading_period: input.isGradingPeriod,
      tracks: parseTracks(input.track),
    })
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Période introuvable.');
  await audit(ctx, { action: 'academic_periods.update', module: 'academic_years', entityType: 'academic_period', entityId: periodId, after: input });
}

/** Congé ou jour férié : les séances des jours ajoutés ou retirés suivent (déclencheur 0062). */
export async function updateCalendarEvent(ctx: TenantContext, id: string, input: CalendarEventInput): Promise<void> {
  requireWritable(ctx, 'academic_years.manage');
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('school_calendar_events')
    .select('id, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!event) throw new NotFoundError('Événement introuvable.');
  await loadEditableYear(ctx, event.academic_year_id);

  const { data, error } = await supabase
    .from('school_calendar_events')
    .update({
      name: input.name,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      blocks_schedule: input.blocksSchedule,
      tracks: parseTracks(input.track),
    })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Événement introuvable.');
  await audit(ctx, { action: 'calendar_events.update', module: 'academic_years', entityType: 'school_calendar_event', entityId: id, after: input });
}
