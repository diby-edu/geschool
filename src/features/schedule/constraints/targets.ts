import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ConstraintScope } from './catalog';

/**
 * Sur qui peut porter une règle : les niveaux, les classes, les matières et les
 * enseignants de l'établissement. Une seule requête par liste, faite une fois
 * pour l'écran entier — le formulaire change de cible sans aller-retour.
 */

export type Target = { id: string; name: string };
export type Targets = Record<Exclude<ConstraintScope, 'SCHOOL'>, Target[]>;

export async function listTargets(ctx: TenantContext): Promise<Targets> {
  const supabase = await createClient();
  const yearId = ctx.academicYear?.id ?? null;

  const [{ data: levels }, { data: classes }, { data: subjects }, { data: teachers }] = await Promise.all([
    supabase.from('levels').select('id, name, sequence').eq('school_id', ctx.school.id).order('sequence'),
    yearId
      ? supabase
          .from('classes')
          .select('id, name')
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
          .eq('status', 'ACTIVE')
          .order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('subjects').select('id, name').eq('school_id', ctx.school.id).eq('is_active', true).order('name'),
    supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .order('last_name'),
  ]);

  return {
    LEVEL: ((levels ?? []) as { id: string; name: string }[]).map((l) => ({ id: l.id, name: l.name })),
    CLASS: ((classes ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
    SUBJECT: ((subjects ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })),
    TEACHER: ((teachers ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => ({
      id: t.id,
      name: `${t.last_name.toUpperCase()} ${t.first_name}`,
    })),
  };
}
