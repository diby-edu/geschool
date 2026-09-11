import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';

/**
 * Donnees du tableau de bord, adaptees au role et TOUJOURS filtrees par la RLS.
 *
 * Les requetes tournent sous la session de l'utilisateur (ADR-013) : un parent
 * qui demande le nombre d'eleves obtient le nombre de SES enfants, pas celui de
 * l'etablissement — non par un `if` applicatif, mais parce que la base ne lui
 * renvoie rien d'autre. C'est la meilleure preuve, de bout en bout, que le lot 2
 * fait son travail.
 */

export type StaffOverview = {
  kind: 'staff';
  students: number;
  teachers: number;
  classes: number;
};

export type TeacherOverview = {
  kind: 'teacher';
  classes: { id: string; name: string; level: string | null }[];
};

export type FamilyOverview = {
  kind: 'family';
  students: { id: string; name: string; matricule: string; className: string | null }[];
};

export type DashboardData = StaffOverview | TeacherOverview | FamilyOverview;

export async function getDashboardData(ctx: TenantContext): Promise<DashboardData> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;

  // Personnel : vue d'ensemble chiffree
  if (hasPermission(ctx, 'students.view') || ctx.isPlatformAdmin) {
    const [students, teachers, classes] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null),
      supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'ACTIVE'),
    ]);
    return {
      kind: 'staff',
      students: students.count ?? 0,
      teachers: teachers.count ?? 0,
      classes: classes.count ?? 0,
    };
  }

  const roles = ctx.membership?.roles ?? [];

  // Enseignant : ses classes (la RLS ne renvoie que celles qu'il assure)
  if (roles.includes('TEACHER')) {
    const { data } = await supabase
      .from('classes')
      .select('id, name, levels(name)')
      .eq('school_id', schoolId)
      .eq('status', 'ACTIVE')
      .order('name');
    // Jointure imbriquee non typee : annotation explicite de la forme reelle.
    const rows = (data ?? []) as unknown as {
      id: string;
      name: string;
      levels: { name: string } | null;
    }[];
    return {
      kind: 'teacher',
      classes: rows.map((c) => ({ id: c.id, name: c.name, level: c.levels?.name ?? null })),
    };
  }

  // Parent ou eleve : les eleves de son perimetre
  const { data } = await supabase
    .from('students')
    .select('id, first_name, last_name, matricule')
    .eq('school_id', schoolId)
    .is('deleted_at', null)
    .order('last_name');

  return {
    kind: 'family',
    students: (data ?? []).map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      matricule: s.matricule,
      className: null,
    })),
  };
}
