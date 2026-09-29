import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type ClassRow = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  level_name: string | null;
  head_teacher: string | null;
  enrolled: number;
};

export async function listClasses(ctx: TenantContext, yearId: string): Promise<ClassRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('id, code, name, capacity, levels(name), teachers(first_name, last_name), student_enrollments(count)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('code');
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    code: string;
    name: string;
    capacity: number;
    levels: { name: string } | null;
    teachers: { first_name: string; last_name: string } | null;
    student_enrollments: { count: number }[];
  }[]).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    capacity: c.capacity,
    level_name: c.levels?.name ?? null,
    head_teacher: c.teachers ? `${c.teachers.first_name} ${c.teachers.last_name}` : null,
    enrolled: c.student_enrollments?.[0]?.count ?? 0,
  }));
}

export async function getClass(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, code, name, capacity, level_id, head_teacher_id, main_room_id, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export type ClassBoardRow = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  enrolled: number;
  levelId: string;
  levelName: string;
  levelCode: string;
  track: string;
  headTeacher: string | null;
  status: string;
};

export type ClassBoard = {
  rows: ClassBoardRow[];
  total: number;
  counts: { active: number; archived: number; students: number };
  levels: { id: string; name: string }[];
};

export type ClassBoardFilters = {
  status: 'ACTIVE' | 'ARCHIVED';
  track?: string;
  levelId?: string;
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
};

/**
 * La liste des classes telle que l'écran la montre : filtrée, triée, comptée.
 *
 * Tout est chargé puis trié en mémoire — une école a des dizaines de classes,
 * pas des dizaines de milliers — ce qui permet de trier sur l'EFFECTIF et le
 * NIVEAU, que la base ne saurait ordonner sans jointure coûteuse.
 */
export async function listClassBoard(
  ctx: TenantContext,
  yearId: string,
  filters: ClassBoardFilters,
): Promise<ClassBoard> {
  const supabase = await createClient();
  const [{ data, error }, { data: levels }, { data: cycles }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, code, name, capacity, status, level_id, teachers(first_name, last_name), student_enrollments(count)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId),
    supabase.from('levels').select('id, code, name, cycle_id, sequence').eq('school_id', ctx.school.id),
    supabase.from('cycles').select('id, track').eq('school_id', ctx.school.id),
  ]);
  if (error) throw error;

  const trackByCycle = new Map(((cycles ?? []) as { id: string; track: string | null }[]).map((c) => [c.id, c.track ?? 'GENERAL']));
  const levelById = new Map(
    ((levels ?? []) as { id: string; code: string; name: string; cycle_id: string; sequence: number }[]).map((l) => [l.id, l]),
  );

  const all: ClassBoardRow[] = ((data ?? []) as unknown as {
    id: string;
    code: string;
    name: string;
    capacity: number;
    status: string;
    level_id: string;
    teachers: { first_name: string; last_name: string } | null;
    student_enrollments: { count: number }[];
  }[]).map((c) => {
    const level = levelById.get(c.level_id);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      capacity: c.capacity,
      enrolled: c.student_enrollments?.[0]?.count ?? 0,
      levelId: c.level_id,
      levelName: level?.name ?? '—',
      levelCode: level?.code ?? '—',
      track: level ? (trackByCycle.get(level.cycle_id) ?? 'GENERAL') : 'GENERAL',
      headTeacher: c.teachers ? `${c.teachers.last_name.toUpperCase()} ${c.teachers.first_name}` : null,
      status: c.status,
    };
  });

  const counts = {
    active: all.filter((c) => c.status === 'ACTIVE').length,
    archived: all.filter((c) => c.status === 'ARCHIVED').length,
    students: all.filter((c) => c.status === 'ACTIVE').reduce((n, c) => n + c.enrolled, 0),
  };

  const q = (filters.q ?? '').trim().toLowerCase();
  const rows = all.filter(
    (c) =>
      c.status === filters.status &&
      (!filters.track || c.track === filters.track) &&
      (!filters.levelId || c.levelId === filters.levelId) &&
      (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)),
  );

  const dir = filters.dir === 'desc' ? -1 : 1;
  const bySequence = (id: string) => levelById.get(id)?.sequence ?? 999;
  const compare: Record<string, (a: ClassBoardRow, b: ClassBoardRow) => number> = {
    code: (a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }),
    name: (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }),
    level: (a, b) => bySequence(a.levelId) - bySequence(b.levelId) || a.code.localeCompare(b.code, 'fr', { numeric: true }),
    track: (a, b) => a.track.localeCompare(b.track) || a.code.localeCompare(b.code, 'fr', { numeric: true }),
    enrolled: (a, b) => a.enrolled - b.enrolled,
    capacity: (a, b) => a.capacity - b.capacity,
  };
  const cmp = compare[filters.sort ?? 'code'] ?? compare.code!;
  rows.sort((a, b) => cmp(a, b) * dir);

  // Les niveaux proposés suivent l'onglet et l'ordre choisi : dans « technique »,
  // on ne propose pas les niveaux du général, qui ne donneraient aucune ligne.
  const scope = all.filter(
    (c) => c.status === filters.status && (!filters.track || c.track === filters.track),
  );
  const usedLevels = [...new Set(scope.map((c) => c.levelId))]
    .map((id) => ({ id, name: levelById.get(id)?.name ?? '—', sequence: bySequence(id) }))
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ id, name }) => ({ id, name }));

  return { rows, total: rows.length, counts, levels: usedLevels };
}
