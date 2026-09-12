import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { detectConflicts } from '@/lib/schedule/validator';
import { loadValidatorSessions } from './sessions';
import { materializeOccurrences } from './occurrences';

export type VersionRow = {
  id: string;
  number: number;
  name: string;
  status: string;
  source: string;
};

export async function listVersions(ctx: TenantContext, yearId: string): Promise<VersionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id, number, name, status, source')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('number', { ascending: false });
  return (data ?? []) as VersionRow[];
}

export async function getVersion(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id, number, name, status, source, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function createVersion(ctx: TenantContext): Promise<string> {
  requireWritable(ctx, 'schedule.create');
  if (!ctx.academicYear) throw new ValidationError("Activez une annee scolaire d'abord.");
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

  await materializeOccurrences(ctx, id, version.academic_year_id);
  await audit(ctx, { action: 'schedule.publish', module: 'schedule', entityType: 'schedule_version', entityId: id });
}

export async function deleteVersion(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.delete');
  const supabase = await createClient();
  const version = await getVersion(ctx, id);
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status === 'PUBLISHED') {
    throw new ConflictError('Une version publiee ne peut pas etre supprimee ; archivez-la via une nouvelle publication.');
  }
  await supabase.from('schedule_versions').delete().eq('school_id', ctx.school.id).eq('id', id);
  await audit(ctx, { action: 'schedule.version_delete', module: 'schedule', entityType: 'schedule_version', entityId: id });
}
