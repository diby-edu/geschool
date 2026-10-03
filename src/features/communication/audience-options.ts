import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Les classes et les niveaux proposés comme cibles d'une annonce.
 *
 * Seulement ceux de l'année en cours : viser une classe de l'an dernier
 * n'atteindrait personne, et allongerait la liste pour rien.
 */
export type AudienceOption = { id: string; label: string };

export async function audienceOptions(
  ctx: TenantContext,
): Promise<{ classes: AudienceOption[]; levels: AudienceOption[] }> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return { classes: [], levels: [] };
  const supabase = await createClient();

  const [{ data: classes }, { data: levels }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('name'),
    supabase.from('levels').select('id, name, sequence').eq('school_id', ctx.school.id).eq('is_active', true).order('sequence'),
  ]);

  return {
    classes: ((classes ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, label: c.name })),
    levels: ((levels ?? []) as { id: string; name: string }[]).map((l) => ({ id: l.id, label: l.name })),
  };
}
