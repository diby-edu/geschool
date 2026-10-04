import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { requireAdmin } from '@/features/platform/admin';
import { buildQuota, currentMonth, ligneEnQuota, premiereLigneQuota, type SmsQuota } from './quota-math';

/**
 * Les complements de SMS accordes a un etablissement.
 *
 * Une ecole qui epuise son quota ne peut plus envoyer d'alertes. Elle paie un
 * complement comme n'importe quel autre service, et l'editeur l'enregistre
 * ici : un seul nombre par mois, qu'on corrige au besoin plutot que d'empiler
 * des lignes dont personne ne ferait la somme de tete.
 */

export type SmsGrant = {
  id: string;
  month: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
};

/** Le quota du mois pour cet etablissement, vu depuis la plateforme. */
export async function readQuotaForSchool(schoolId: string): Promise<SmsQuota> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sms_quota' as never, { p_school: schoolId } as never);
  if (error) throw error;
  const ligne = premiereLigneQuota(data);
  return ligne ? ligneEnQuota(ligne) : buildQuota(0, 0, 0);
}

/** Les derniers complements accordes, le plus recent d'abord. */
export async function listGrants(schoolId: string, limit = 12): Promise<SmsGrant[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from('sms_quota_grants')
    .select('id, covers_month, quantity, reason, created_at')
    .eq('school_id', schoolId)
    .order('covers_month', { ascending: false })
    .limit(limit);

  return ((data ?? []) as {
    id: string;
    covers_month: string;
    quantity: number;
    reason: string | null;
    created_at: string;
  }[]).map((g) => ({
    id: g.id,
    month: g.covers_month,
    quantity: g.quantity,
    reason: g.reason,
    createdAt: g.created_at,
  }));
}

/**
 * Accorder — ou corriger — le complement d'un mois.
 *
 * A zero, le complement est retire : l'ecole revient au quota de sa formule.
 */
export async function grantSms(schoolId: string, quantity: number, month: string, reason: string): Promise<void> {
  const { userId } = await requireAdmin();
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) {
    throw new ValidationError('Nombre de SMS incorrect : entre 0 et 100 000.');
  }
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new ValidationError('Mois incorrect.');

  const supabase = await createClient();
  const { data: avant } = await supabase
    .from('sms_quota_grants')
    .select('id, quantity')
    .eq('school_id', schoolId)
    .eq('covers_month', month)
    .maybeSingle();

  if (quantity === 0) {
    if (!avant) return;
    const { error } = await supabase.from('sms_quota_grants').delete().eq('id', avant.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('sms_quota_grants').upsert(
      {
        school_id: schoolId,
        covers_month: month,
        quantity,
        reason: reason.trim().slice(0, 200) || null,
        granted_by: userId,
      },
      { onConflict: 'school_id,covers_month' },
    );
    if (error) throw error;
  }

  await auditPlatform(userId, {
    action: 'platform.sms_quota_grant',
    module: 'platform',
    entityType: 'school',
    entityId: schoolId,
    schoolId,
    before: avant ? { quantity: avant.quantity } : null,
    after: { quantity, month, reason: reason.trim() || null },
  });
}

/** Le mois en cours, pour pre-remplir le formulaire. */
export { currentMonth };
