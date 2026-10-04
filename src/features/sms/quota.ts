import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { ligneEnQuota, premiereLigneQuota, type SmsQuota } from './quota-math';

/**
 * Combien de SMS il reste a un etablissement ce mois-ci.
 *
 * Le calcul vit dans `quota-math.ts` (module neutre) ; ici, seulement la
 * lecture en base.
 */

export * from './quota-math';

/**
 * Le quota de l'etablissement courant, pour l'afficher.
 *
 * `null` quand la personne n'a pas le droit de le voir : la fonction en base
 * ne renvoie alors aucune ligne (migration 0095).
 */
export async function readSmsQuota(ctx: TenantContext): Promise<SmsQuota | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sms_quota' as never, { p_school: ctx.school.id } as never);
  if (error) {
    console.error('[sms] quota illisible :', error.message);
    return null;
  }
  const ligne = premiereLigneQuota(data);
  return ligne ? ligneEnQuota(ligne) : null;
}
