import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/** Sauvegardes et remises d'une école (0156), lues avec la session (la base vérifie le droit). */

export type SchoolBackup = {
  id: string;
  kind: 'BACKUP' | 'RESTORE';
  status: 'RUNNING' | 'OK' | 'FAILED';
  scope: 'SCHOOL' | 'YEAR';
  yearId: string | null;
  yearName: string | null;
  trigger: 'MANUAL' | 'YEAR_CLOSE' | 'BEFORE_RESTORE' | 'UPLOAD';
  createdAt: string;
  finishedAt: string | null;
  createdBy: string | null;
  sizeBytes: number | null;
  counts: Record<string, unknown>;
  restoreOf: string | null;
  categories: string[];
  error: string | null;
};

export async function listSchoolBackups(schoolId: string): Promise<SchoolBackup[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('school_backups' as never)
    .select('id, kind, status, scope, academic_year_id, trigger, created_at, finished_at, created_by, size_bytes, counts, restore_of, categories, error')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return null; // migration 0156 pas encore appliquée
  const rows = (data ?? []) as unknown as {
    id: string; kind: SchoolBackup['kind']; status: SchoolBackup['status']; scope: SchoolBackup['scope']; academic_year_id: string | null;
    trigger: SchoolBackup['trigger']; created_at: string; finished_at: string | null; created_by: string | null; size_bytes: number | null;
    counts: Record<string, unknown> | null; restore_of: string | null; categories: string[] | null; error: string | null;
  }[];
  const yearIds = [...new Set(rows.map((r) => r.academic_year_id).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x))];
  const [{ data: years }, { data: users }] = await Promise.all([
    yearIds.length ? supabase.from('academic_years').select('id, name').in('id', yearIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from('users').select('id, first_name, last_name').in('id', userIds) : Promise.resolve({ data: [] }),
  ]);
  const yearName = new Map(((years ?? []) as { id: string; name: string }[]).map((y) => [y.id, y.name]));
  const userName = new Map(
    ((users ?? []) as { id: string; first_name: string; last_name: string }[]).map((u) => [u.id, `${u.last_name.toUpperCase()} ${u.first_name}`.trim() || null]),
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    scope: r.scope,
    yearId: r.academic_year_id,
    yearName: r.academic_year_id ? (yearName.get(r.academic_year_id) ?? null) : null,
    trigger: r.trigger,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    createdBy: r.created_by ? (userName.get(r.created_by) ?? null) : null,
    sizeBytes: r.size_bytes,
    counts: r.counts ?? {},
    restoreOf: r.restore_of,
    categories: r.categories ?? [],
    error: r.error,
  }));
}

export async function listYears(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('academic_years').select('id, name').eq('school_id', ctx.school.id).order('starts_on', { ascending: false });
  return (data ?? []) as { id: string; name: string }[];
}
