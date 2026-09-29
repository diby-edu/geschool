import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';

/**
 * Recherche de la barre du haut : élèves, enseignants, personnel. Chaque liste
 * n'est interrogée que si le droit de la voir est coché (la RLS refuserait de
 * toute façon), et le résultat reste borné.
 */

export type SearchHit = { id: string; name: string; detail: string; href: string };
export type SearchResults = { students: SearchHit[] | null; teachers: SearchHit[] | null; staff: SearchHit[] | null };

const LIMIT = 8;

/** Échappe les caractères du motif `ilike` pour qu'une recherche « 100% » ne devienne pas un joker. */
function pattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const fullName = (last: string, first: string) => `${last.toUpperCase()} ${first}`;

export async function search(ctx: TenantContext, q: string): Promise<SearchResults> {
  const term = q.trim();
  if (term.length < 2) return { students: null, teachers: null, staff: null };
  const supabase = await createClient();
  const school = ctx.school.id;
  const base = `/e/${ctx.school.slug}`;
  const like = pattern(term);

  const [students, teachers, staff] = await Promise.all([
    hasPermission(ctx, 'students.view')
      ? supabase
          .from('students')
          .select('id, matricule, first_name, last_name')
          .eq('school_id', school)
          .is('deleted_at', null)
          .or(`last_name.ilike.${like},first_name.ilike.${like},matricule.ilike.${like}`)
          .order('last_name')
          .limit(LIMIT)
      : Promise.resolve(null),
    hasPermission(ctx, 'teachers.view')
      ? supabase
          .from('teachers')
          .select('id, staff_number, first_name, last_name, specialty')
          .eq('school_id', school)
          .is('deleted_at', null)
          .or(`last_name.ilike.${like},first_name.ilike.${like},staff_number.ilike.${like}`)
          .order('last_name')
          .limit(LIMIT)
      : Promise.resolve(null),
    hasPermission(ctx, 'users.view')
      ? supabase
          .from('staff_profiles')
          .select('user_id, staff_number, first_name, last_name')
          .eq('school_id', school)
          .or(`last_name.ilike.${like},first_name.ilike.${like},staff_number.ilike.${like}`)
          .order('last_name')
          .limit(LIMIT)
      : Promise.resolve(null),
  ]);

  return {
    students:
      students?.data?.map((s) => ({
        id: s.id,
        name: fullName(s.last_name, s.first_name),
        detail: s.matricule,
        href: `${base}/students/${s.id}`,
      })) ?? null,
    teachers:
      teachers?.data?.map((t) => ({
        id: t.id,
        name: fullName(t.last_name, t.first_name),
        detail: [t.staff_number, t.specialty].filter(Boolean).join(' · '),
        href: `${base}/teachers/${t.id}`,
      })) ?? null,
    staff:
      staff?.data?.map((p) => ({
        id: p.user_id,
        name: fullName(p.last_name, p.first_name),
        detail: p.staff_number ?? 'Personnel',
        href: `${base}/personnel/${p.user_id}`,
      })) ?? null,
  };
}
