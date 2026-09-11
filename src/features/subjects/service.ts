import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { SubjectInput } from './schemas';

/**
 * Ecritures sur les matieres. Toujours filtrees par ctx.school.id : un
 * identifiant fourni par le client est verifie contre l'etablissement courant
 * (protection IDOR), en plus de la RLS qui refuserait de toute facon une
 * ecriture hors tenant.
 */

function toRow(input: SubjectInput) {
  return {
    code: input.code,
    name: input.name,
    short_name: input.shortName || null,
    category: input.category || null,
    color: input.color || null,
    default_coefficient: input.defaultCoefficient,
    is_active: input.isActive,
  };
}

export async function createSubject(ctx: TenantContext, input: SubjectInput): Promise<string> {
  requireWritable(ctx, 'subjects.create');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subjects')
    .insert({ school_id: ctx.school.id, ...toRow(input) })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') throw new ConflictError('Une matiere porte deja ce code.');
    throw error;
  }

  await audit(ctx, {
    action: 'subjects.create',
    module: 'subjects',
    entityType: 'subject',
    entityId: data.id,
    after: toRow(input),
  });
  return data.id;
}

export async function updateSubject(
  ctx: TenantContext,
  id: string,
  input: SubjectInput,
): Promise<void> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subjects')
    .update(toRow(input))
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') throw new ConflictError('Une matiere porte deja ce code.');
    throw error;
  }
  if (!data) throw new NotFoundError('Cette matiere est introuvable.');

  await audit(ctx, {
    action: 'subjects.update',
    module: 'subjects',
    entityType: 'subject',
    entityId: id,
    after: toRow(input),
  });
}

export async function deleteSubject(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'subjects.delete');
  const supabase = await createClient();

  const { error, count } = await supabase
    .from('subjects')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);

  if (error) {
    // Reference par un programme, une affectation, une evaluation…
    if (error.code === '23503') {
      throw new ConflictError(
        'Cette matiere est utilisee (programme, affectation ou evaluation) et ne peut pas etre supprimee. Desactivez-la plutot.',
      );
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Cette matiere est introuvable.');

  await audit(ctx, {
    action: 'subjects.delete',
    module: 'subjects',
    entityType: 'subject',
    entityId: id,
  });
}
