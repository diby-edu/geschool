import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import type { Tables } from '@/types/database';

export type SubjectRow = Pick<
  Tables<'subjects'>,
  'id' | 'code' | 'name' | 'short_name' | 'category' | 'color' | 'default_coefficient' | 'is_active'
>;

const SORT_COLUMNS = ['code', 'name', 'default_coefficient'] as const;
export const SUBJECT_SORTABLE = SORT_COLUMNS;

export async function listSubjects(
  ctx: TenantContext,
  params: ListParams,
): Promise<{ rows: SubjectRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('subjects')
    .select('id, code, name, short_name, category, color, default_coefficient, is_active', {
      count: 'exact',
    })
    .eq('school_id', ctx.school.id);

  if (params.q) {
    // Recherche sur le nom ou le code
    query = query.or(`name.ilike.%${params.q}%,code.ilike.%${params.q}%`);
  }

  const sort = params.sort && (SORT_COLUMNS as readonly string[]).includes(params.sort)
    ? params.sort
    : 'name';
  query = query.order(sort, { ascending: params.dir === 'asc' }).range(params.from, params.to);

  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as SubjectRow[], total: count ?? 0 };
}

export async function getSubject(ctx: TenantContext, id: string): Promise<SubjectRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('id, code, name, short_name, category, color, default_coefficient, is_active')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return (data as SubjectRow | null) ?? null;
}
