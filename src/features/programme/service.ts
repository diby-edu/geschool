import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';
import type { LevelSubjectInput } from './schemas';

/**
 * Ajoute ou met a jour une matiere au programme d'un niveau. L'upsert sur
 * (level_id, subject_id) fait office d'edition : reselectionner une matiere
 * deja au programme met a jour son coefficient et son volume.
 */
export async function upsertLevelSubject(ctx: TenantContext, input: LevelSubjectInput): Promise<void> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();

  const { error } = await supabase.from('level_subjects').upsert(
    {
      school_id: ctx.school.id,
      level_id: input.levelId,
      subject_id: input.subjectId,
      coefficient: input.coefficient,
      weekly_minutes: input.weeklyMinutes,
      is_mandatory: input.isMandatory,
    },
    { onConflict: 'level_id,subject_id' },
  );
  if (error) throw error;

  await audit(ctx, {
    action: 'programme.upsert',
    module: 'programme',
    entityType: 'level_subject',
    after: input,
  });
}

export async function removeLevelSubject(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('level_subjects')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Entree introuvable.');
  await audit(ctx, { action: 'programme.remove', module: 'programme', entityType: 'level_subject', entityId: id });
}
