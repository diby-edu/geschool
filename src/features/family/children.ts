import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Les eleves dont l'utilisateur courant est le responsable, dans cet
 * etablissement. Necessaire des qu'une personne cumule des roles : un
 * enseignant qui est aussi parent VOIT (par la securite) les eleves de ses
 * classes ET son propre enfant ; l'espace Parent ne doit montrer que ce
 * dernier. Les deux lectures passent par la RLS de l'utilisateur.
 */
export async function myChildrenIds(ctx: TenantContext): Promise<string[]> {
  const supabase = await createClient();
  const { data: guardians } = await supabase
    .from('guardians')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id);
  const guardianIds = (guardians ?? []).map((g) => g.id);
  if (guardianIds.length === 0) return [];

  const { data: links } = await supabase
    .from('student_guardians')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .in('guardian_id', guardianIds);
  return [...new Set((links ?? []).map((l) => l.student_id))];
}

export type Child = {
  id: string;
  name: string;
  matricule: string;
  className: string | null;
  classId: string | null;
};

/**
 * Les memes enfants, avec de quoi les afficher et retrouver leur classe —
 * laquelle porte le niveau, donc l'ordre d'enseignement, donc le decoupage de
 * l'annee (trimestres ou semestres). Les pages de l'espace Parent partent
 * toutes de cette liste.
 */
export async function myChildren(ctx: TenantContext): Promise<Child[]> {
  const ids = await myChildrenIds(ctx);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const yearId = ctx.academicYear?.id ?? null;

  const [{ data: students }, { data: enrollments }] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name, matricule')
      .eq('school_id', ctx.school.id)
      .in('id', ids)
      .is('deleted_at', null)
      .order('last_name'),
    yearId
      ? supabase
          .from('student_enrollments')
          .select('student_id, class_id, classes(name)')
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
          .eq('status', 'ENROLLED')
          .in('student_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const byStudent = new Map(
    ((enrollments ?? []) as unknown as { student_id: string; class_id: string | null; classes: { name: string } | null }[]).map(
      (e) => [e.student_id, e],
    ),
  );

  return ((students ?? []) as { id: string; first_name: string; last_name: string; matricule: string }[]).map((s) => {
    const e = byStudent.get(s.id);
    return {
      id: s.id,
      name: `${s.last_name.toUpperCase()} ${s.first_name}`,
      matricule: s.matricule,
      className: e?.classes?.name ?? null,
      classId: e?.class_id ?? null,
    };
  });
}

/**
 * L'enfant affiche : celui demande dans l'URL s'il est bien le sien, le premier
 * sinon. Un identifiant inconnu ne doit JAMAIS faire une page en erreur — ni,
 * surtout, servir a tâter l'existence d'un eleve qui n'est pas le sien.
 */
export function pickChild<T extends { id: string }>(children: T[], wanted: string | undefined): T | null {
  if (children.length === 0) return null;
  return children.find((c) => c.id === wanted) ?? children[0]!;
}
