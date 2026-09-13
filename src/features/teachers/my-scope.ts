import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getMyTeacherId } from '@/features/schedule/my-schedule';

export { getMyTeacherId } from '@/features/schedule/my-schedule';

export type MyClass = { id: string; name: string; level: string | null };
export type Ref = { id: string; name: string };

/**
 * Classes de l'enseignant connecte (affectation directe ou professeur
 * principal), pour l'annee courante. Perimetre reel derive de
 * teaching_assignments — jamais une liste saisie a la main (RBAC.md §3).
 */
export async function getMyTaughtClasses(ctx: TenantContext): Promise<MyClass[]> {
  const teacherId = await getMyTeacherId(ctx);
  const yearId = ctx.academicYear?.id;
  if (!teacherId || !yearId) return [];
  const supabase = await createClient();

  type ClassRef = { id: string; name: string; levels: { name: string } | null };
  const [{ data: assigned }, { data: headOf }] = await Promise.all([
    supabase
      .from('teaching_assignments')
      .select('class_id, classes(id, name, levels(name))')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('teacher_id', teacherId)
      .eq('status', 'ACTIVE')
      .not('class_id', 'is', null),
    supabase
      .from('classes')
      .select('id, name, levels(name)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .eq('head_teacher_id', teacherId),
  ]);

  const byId = new Map<string, MyClass>();
  for (const r of (assigned ?? []) as unknown as { class_id: string; classes: ClassRef | null }[]) {
    if (r.classes) byId.set(r.classes.id, { id: r.classes.id, name: r.classes.name, level: r.classes.levels?.name ?? null });
  }
  for (const c of (headOf ?? []) as unknown as ClassRef[]) {
    byId.set(c.id, { id: c.id, name: c.name, level: c.levels?.name ?? null });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Disciplines que l'enseignant enseigne REELLEMENT dans cette classe (jamais
 * toutes les matieres de l'etablissement) : une seule -> le formulaire la
 * verrouille ; plusieurs -> l'enseignant choisit parmi elles uniquement.
 */
export async function getMySubjectsForClass(ctx: TenantContext, classId: string): Promise<Ref[]> {
  const teacherId = await getMyTeacherId(ctx);
  const yearId = ctx.academicYear?.id;
  if (!teacherId || !yearId) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from('teaching_assignments')
    .select('subject_id, subjects(id, name)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .eq('status', 'ACTIVE');

  const byId = new Map<string, string>();
  for (const r of (data ?? []) as unknown as { subject_id: string; subjects: { id: string; name: string } | null }[]) {
    if (r.subjects) byId.set(r.subjects.id, r.subjects.name);
  }
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
