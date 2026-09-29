import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import type { Tables } from '@/types/database';
import { EMPLOYMENT_OPTIONS, type EmploymentCode } from '@/lib/hr';
import { loadTeacherContacts } from './contacts';

export type TeacherRow = Pick<
  Tables<'teachers'>,
  'id' | 'staff_number' | 'first_name' | 'last_name' | 'specialty' | 'status' | 'user_id' | 'phone_e164' | 'employment_type' | 'diploma'
>;

export const TEACHER_SORTABLE = ['staff_number', 'last_name'] as const;

export type ContractCode = EmploymentCode;
export const CONTRACT_FILTERS = EMPLOYMENT_OPTIONS.map((o) => o.code) as readonly ContractCode[];

/** Nombre d'enseignants par type de contrat (une seule lecture, filtrée par la RLS). */
export async function countTeachersByContract(ctx: TenantContext): Promise<Record<ContractCode | 'ALL', number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teachers')
    .select('employment_type')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw error;
  const out: Record<string, number> = { ALL: 0 };
  for (const c of CONTRACT_FILTERS) out[c] = 0;
  for (const r of data ?? []) {
    out.ALL = (out.ALL ?? 0) + 1;
    out[r.employment_type] = (out[r.employment_type] ?? 0) + 1;
  }
  return out as Record<ContractCode | 'ALL', number>;
}

export async function listTeachers(
  ctx: TenantContext,
  params: ListParams,
  contract?: ContractCode,
): Promise<{ rows: TeacherRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('teachers')
    .select('id, staff_number, first_name, last_name, specialty, status, user_id, employment_type, diploma', {
      count: 'exact',
    })
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null);
  if (contract) query = query.eq('employment_type', contract);

  if (params.q) {
    query = query.or(
      `last_name.ilike.%${params.q}%,first_name.ilike.%${params.q}%,staff_number.ilike.%${params.q}%`,
    );
  }

  const sort = params.sort && (TEACHER_SORTABLE as readonly string[]).includes(params.sort)
    ? params.sort
    : 'last_name';
  query = query.order(sort, { ascending: params.dir === 'asc' }).range(params.from, params.to);

  const { data, count, error } = await query;
  if (error) throw error;
  const contacts = await loadTeacherContacts(ctx, (data ?? []).map((t) => t.id));
  return {
    rows: (data ?? []).map((t) => ({ ...t, phone_e164: contacts.get(t.id)?.phone_e164 ?? null })),
    total: count ?? 0,
  };
}

export async function getTeacher(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select(
      'id, staff_number, first_name, last_name, gender, specialty, employment_type, status, hire_date, diploma, diploma_detail, weekly_minutes_min, weekly_minutes_max, user_id',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const c = (await loadTeacherContacts(ctx, [data.id])).get(data.id);
  return {
    ...data,
    birth_date: c?.birth_date ?? null,
    phone_e164: c?.phone_e164 ?? null,
    email: c?.email ?? null,
    address: c?.address ?? null,
  };
}

/** Enseignants actifs, pour un selecteur (professeur principal, affectations). */
export async function listActiveTeachers(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select('id, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .eq('status', 'ACTIVE')
    .is('deleted_at', null)
    .order('last_name');
  return (data ?? []).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` }));
}
