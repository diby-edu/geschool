import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Coordonnées des enseignants (téléphone, e-mail, adresse, date de naissance,
 * notes). Elles ne se lisent plus dans la table (0059) : seul le nom sert aux
 * écrans des classes, de l'emploi du temps, des présences… La fonction
 * teacher_contacts les rend à qui détient « Voir les enseignants », ou pour sa
 * propre fiche ; sinon les enseignants demandés sont simplement absents du résultat.
 */
export type TeacherContact = {
  id: string;
  birth_date: string | null;
  phone_e164: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const CHUNK = 500;

export async function loadTeacherContacts(ctx: TenantContext, ids: readonly string[]): Promise<Map<string, TeacherContact>> {
  const out = new Map<string, TeacherContact>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('teacher_contacts' as never, { p_school: ctx.school.id, p_ids: chunk } as never);
    if (error && (error.code === 'PGRST202' || error.code === '42883')) {
      // Base pas encore migrée (0059) : les colonnes se lisent encore directement.
      const { data: rows, error: readError } = await supabase
        .from('teachers')
        .select('id, birth_date, phone_e164, email, address, notes')
        .eq('school_id', ctx.school.id)
        .in('id', chunk);
      if (readError) throw readError;
      for (const c of (rows ?? []) as TeacherContact[]) out.set(c.id, c);
      continue;
    }
    if (error) throw error;
    for (const c of (data ?? []) as unknown as TeacherContact[]) out.set(c.id, c);
  }
  return out;
}
