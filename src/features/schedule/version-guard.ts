import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * À appeler AVANT toute modification des séances d'une version (ajout,
 * déplacement, suppression).
 *
 *  - Version archivée : refus (c'est de l'histoire).
 *  - Version PUBLIÉE : on peut y changer un créneau en cours d'année, sans tout
 *    refaire, avec le droit de modifier l'emploi du temps (décision de
 *    l'établissement). Le changement est immédiat : enseignants, élèves, appel. Après la modification, l'appelant
 *    recrée les séances à venir du cours (resyncPublishedSession) ; le passé et
 *    ses appels ne bougent pas.
 *  - Version vérifiée : elle repasse en brouillon. La signature du
 *    vérificateur ne couvre que ce qu'il a vu ; il faudra la revalider.
 */
export async function prepareVersionForEdit(
  ctx: TenantContext,
  versionId: string,
): Promise<{ academicYearId: string; unvalidated: boolean; published: boolean }> {
  const supabase = await createClient();
  const { data: version } = await supabase
    .from('schedule_versions')
    .select('id, status, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', versionId)
    .maybeSingle();
  if (!version) throw new NotFoundError('Version introuvable.');
  if (version.status === 'ARCHIVED') {
    throw new ValidationError('Cette version est archivée : elle ne se modifie plus.');
  }
  if (version.status === 'PUBLISHED') {
    return { academicYearId: version.academic_year_id, unvalidated: false, published: true };
  }
  if (version.status === 'VALIDATED') {
    const { error } = await supabase
      .from('schedule_versions')
      .update({ status: 'DRAFT', validated_at: null, validated_by: null, validation_note: null })
      .eq('school_id', ctx.school.id)
      .eq('id', versionId);
    if (error) throw error;
    await audit(ctx, {
      action: 'schedule.unvalidate',
      module: 'schedule',
      entityType: 'schedule_version',
      entityId: versionId,
      after: { reason: 'modification après vérification' },
    });
    return { academicYearId: version.academic_year_id, unvalidated: true, published: false };
  }
  return { academicYearId: version.academic_year_id, unvalidated: false, published: false };
}

/**
 * Après un changement dans l'emploi du temps publié : les séances à venir du
 * cours sont recréées à leur nouvel horaire. Le passé ne bouge pas.
 */
export async function resyncPublishedSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('resync_session_occurrences' as never, { p_session: sessionId } as never);
  if (error) throw error;
}

/**
 * Un cours de l'emploi du temps publié qui a déjà eu lieu ne se supprime pas :
 * la suppression effacerait ses séances passées, leurs appels et leurs
 * absences — et aussi les appels NON faits, qui servent à vérifier la
 * présence de l'enseignant.
 */
export async function sessionHasHistory(ctx: TenantContext, sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('session_occurrences')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('schedule_session_id', sessionId)
    .lte('starts_at', new Date().toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}
