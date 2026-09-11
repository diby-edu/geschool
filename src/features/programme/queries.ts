import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type LevelSubjectRow = {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  coefficient: number;
  weekly_minutes: number;
  is_mandatory: boolean;
};

export async function listLevelSubjects(ctx: TenantContext, levelId: string): Promise<LevelSubjectRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('level_subjects')
    .select('id, subject_id, coefficient, weekly_minutes, is_mandatory, subjects(name, code)')
    .eq('school_id', ctx.school.id)
    .eq('level_id', levelId);
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    subject_id: string;
    coefficient: number;
    weekly_minutes: number;
    is_mandatory: boolean;
    subjects: { name: string; code: string } | null;
  }[])
    .map((r) => ({
      id: r.id,
      subject_id: r.subject_id,
      subject_name: r.subjects?.name ?? '—',
      subject_code: r.subjects?.code ?? '',
      coefficient: r.coefficient,
      weekly_minutes: r.weekly_minutes,
      is_mandatory: r.is_mandatory,
    }))
    .sort((a, b) => a.subject_name.localeCompare(b.subject_name));
}
