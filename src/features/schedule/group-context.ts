import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { GroupContext, ValidatorSession } from '@/lib/schedule/validator';

const ID_BATCH = 150; // une liste d'identifiants trop longue ferait rejeter l'URL

/**
 * Ce que le validateur doit savoir des groupes d'un emploi du temps : TOUTES
 * leurs classes (un groupe peut en réunir plusieurs), et leurs élèves actuels.
 *
 * Sans ce contexte, le validateur ne voyait ni le cours d'un groupe posé sur
 * le cours de sa classe entière, ni deux groupes qui partagent des élèves
 * (Espagnol et option Latin) à la même heure. Chaque contrôle (ajout,
 * déplacement, validation, publication, affichage) passe désormais par ici.
 */
export async function loadGroupContext(ctx: TenantContext, groupIds: Iterable<string>): Promise<GroupContext> {
  const ids = [...new Set(groupIds)];
  const classesOf = new Map<string, string[]>();
  const studentsOf = new Map<string, Set<string>>();
  if (ids.length === 0) return { classesOf, studentsOf };

  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    const { data: links, error } = await supabase
      .from('group_classes')
      .select('group_id, class_id')
      .eq('school_id', ctx.school.id)
      .in('group_id', batch);
    if (error) throw error;
    for (const l of links ?? []) {
      const list = classesOf.get(l.group_id) ?? [];
      list.push(l.class_id);
      classesOf.set(l.group_id, list);
    }

    type Member = { id: string; group_id: string; student_id: string };
    const members = await fetchAllRows<Member>((cursor) => {
      let q = supabase
        .from('student_groups')
        .select('id, group_id, student_id')
        .eq('school_id', ctx.school.id)
        .in('group_id', batch)
        .is('left_at', null)
        .order('id')
        .limit(1000);
      if (cursor) q = q.gt('id', cursor);
      return q as unknown as PromiseLike<{ data: Member[] | null; error: { message: string } | null }>;
    }, 1000);
    for (const m of members) {
      const set = studentsOf.get(m.group_id) ?? new Set<string>();
      set.add(m.student_id);
      studentsOf.set(m.group_id, set);
    }
  }
  return { classesOf, studentsOf };
}

/** Le contexte des groupes présents dans ces séances. */
export function loadGroupContextFor(ctx: TenantContext, sessions: readonly ValidatorSession[]): Promise<GroupContext> {
  return loadGroupContext(ctx, sessions.flatMap((s) => s.groupIds));
}
