import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { detectConflicts } from '@/lib/schedule/validator';
import { loadValidatorSessions } from './sessions';
import { materializeOccurrences } from './occurrences';
import { readSettings } from '@/features/settings/school-settings';

export type VersionRow = {
  id: string;
  number: number;
  name: string;
  status: string;
  source: string;
  validatedAt: string | null;
  validationNote: string | null;
};

export async function listVersions(ctx: TenantContext, yearId: string): Promise<VersionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id, number, name, status, source, validated_at, validation_note')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('number', { ascending: false });
  return ((data ?? []) as unknown as {
    id: string; number: number; name: string; status: string; source: string;
    validated_at: string | null; validation_note: string | null;
  }[]).map((v) => ({
    id: v.id,
    number: v.number,
    name: v.name,
    status: v.status,
    source: v.source,
    validatedAt: v.validated_at,
    validationNote: v.validation_note,
  }));
}

export async function getVersion(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id, number, name, status, source, academic_year_id, validated_at, validation_note')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function createVersion(ctx: TenantContext): Promise<string> {
  requireWritable(ctx, 'schedule.create');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;

  const { data: last } = await supabase
    .from('schedule_versions')
    .select('number')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = (last?.number ?? 0) + 1;

  const { data, error } = await supabase
    .from('schedule_versions')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      number,
      name: `Version ${number}`,
      status: 'DRAFT',
      source: 'MANUAL',
      created_by: ctx.user.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit(ctx, { action: 'schedule.version_create', module: 'schedule', entityType: 'schedule_version', entityId: data.id });
  return data.id;
}

/**
 * Publie une version. Refuse s'il reste des conflits durs (validateur
 * independant). Sinon : archive la version publiee actuelle, publie celle-ci,
 * et materialise les occurrences datees (ADR-002). Une generation ne remplace
 * jamais la publiee sans passer par ici (additif §61).
 */
export async function publishVersion(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.publish');
  const supabase = await createClient();

  const version = await getVersion(ctx, id);
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status === 'PUBLISHED') return;

  // Un emploi du temps se vérifie avant d'être diffusé à tout l'établissement.
  // L'école qui n'a qu'une personne pour les deux gestes peut retirer l'étape.
  if (version.status === 'DRAFT' && (await validationRequired(ctx))) {
    throw new ConflictError(
      'Cette version n’a pas été vérifiée. Faites-la valider avant de la publier, ' +
        'ou retirez l’étape de validation dans les réglages de l’emploi du temps.',
    );
  }

  const sessions = await loadValidatorSessions(ctx, id);
  const hard = detectConflicts(sessions);
  if (hard.length > 0) {
    throw new ConflictError(
      `Publication impossible : ${hard.length} conflit(s) a resoudre. Premier : ${hard[0]!.message}`,
    );
  }

  // Archiver la publiee actuelle (l'index unique partiel l'exige)
  await supabase
    .from('schedule_versions')
    .update({ status: 'ARCHIVED' })
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', version.academic_year_id)
    .eq('status', 'PUBLISHED');

  const { error } = await supabase
    .from('schedule_versions')
    .update({ status: 'PUBLISHED', published_at: new Date().toISOString(), published_by: ctx.user.id })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;

  await syncYearOccurrences(ctx, id, version.academic_year_id);
  await audit(ctx, { action: 'schedule.publish', module: 'schedule', entityType: 'schedule_version', entityId: id });
}

export async function deleteVersion(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.delete');
  const supabase = await createClient();
  const version = await getVersion(ctx, id);
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status === 'PUBLISHED') {
    throw new ConflictError('Une version publiée ne peut pas être supprimée ; archivez-la via une nouvelle publication.');
  }
  await supabase.from('schedule_versions').delete().eq('school_id', ctx.school.id).eq('id', id);
  await audit(ctx, { action: 'schedule.version_delete', module: 'schedule', entityType: 'schedule_version', entityId: id });
}

/**
 * Séances datées de l'année (celles de l'appel) : la base les produit pour chaque
 * jour de classe — trimestres, hors congés, à partir d'aujourd'hui — et retire
 * celles à venir de l'ancienne version (migration 0063). Tant que la migration
 * n'est pas appliquée, ancienne génération (12 semaines).
 */
async function syncYearOccurrences(ctx: TenantContext, versionId: string, yearId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('sync_schedule_occurrences' as never, { p_year: yearId } as never);
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42883') {
    await materializeOccurrences(ctx, versionId, yearId);
    return;
  }
  throw error;
}

/**
 * L'étape de vérification est-elle exigée dans cet établissement ?
 *
 * Obligatoire par défaut : un emploi du temps publié touche tout le monde en
 * même temps, et une erreur se découvre alors en salle des professeurs. Une
 * école où la même personne construit et diffuse peut la retirer.
 */
export async function validationRequired(ctx: TenantContext): Promise<boolean> {
  const settings = await readSettings(ctx, 'schedule');
  return settings.requireValidation !== false;
}

/**
 * Vérifier une version : elle devient diffusable, sans l'être encore.
 *
 * Les conflits durs sont contrôlés ICI, pas seulement à la publication —
 * valider un emploi du temps qui place deux cours dans la même salle n'aurait
 * aucun sens.
 */
export async function validateVersion(ctx: TenantContext, id: string, note: string): Promise<void> {
  requireWritable(ctx, 'schedule.validate');
  const supabase = await createClient();
  const version = await getVersion(ctx, id);
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status === 'PUBLISHED') throw new ConflictError('Cette version est déjà publiée.');
  if (version.status === 'ARCHIVED') throw new ConflictError('Cette version est archivée.');
  if (version.status === 'VALIDATED') return;

  const sessions = await loadValidatorSessions(ctx, id);
  const hard = detectConflicts(sessions);
  if (hard.length > 0) {
    throw new ConflictError(
      `Validation impossible : ${hard.length} conflit(s) à résoudre. Premier : ${hard[0]!.message}`,
    );
  }

  const { error } = await supabase
    .from('schedule_versions')
    .update({
      status: 'VALIDATED',
      validated_at: new Date().toISOString(),
      validated_by: ctx.user.id,
      validation_note: note.trim() || null,
    })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  await audit(ctx, {
    action: 'schedule.validate',
    module: 'schedule',
    entityType: 'schedule_version',
    entityId: id,
    after: { note },
  });
}

/** Rendre une version à l'atelier : elle redevient modifiable, et perd sa vérification. */
export async function reopenVersion(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.validate');
  const supabase = await createClient();
  const version = await getVersion(ctx, id);
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status !== 'VALIDATED') {
    throw new ConflictError('Seule une version vérifiée et non publiée peut être rouverte.');
  }
  const { error } = await supabase
    .from('schedule_versions')
    .update({ status: 'DRAFT', validated_at: null, validated_by: null, validation_note: null })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'schedule.unvalidate', module: 'schedule', entityType: 'schedule_version', entityId: id });
}
