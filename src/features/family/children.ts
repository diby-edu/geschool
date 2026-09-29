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
