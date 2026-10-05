import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Comment une ecole paie son abonnement.
 *
 * Deux chemins, selon ce que l'editeur a ouvert :
 *
 *  - EN LIGNE, par une passerelle Mobile Money. Le paiement se conclut dans
 *    l'application, le recu s'emet seul, l'abonnement se prolonge seul.
 *  - HORS LIGNE, en attendant : l'ecole verse sur le numero de l'editeur et
 *    signale la reference ; l'editeur confirme.
 *
 * Tant qu'aucune passerelle n'est branchee, l'ecran le DIT au lieu d'afficher
 * un bouton « Payer » qui ne commande rien.
 */

export type PaymentSettings = {
  /** Fournisseur branche ('' = aucun, donc hors ligne seulement). */
  provider: string;
  /** Numero Mobile Money de l'editeur, pour le versement hors ligne. */
  mobileMoneyNumber: string;
  /** Nom du titulaire, que l'ecole verra sur son telephone avant de valider. */
  mobileMoneyName: string;
  /** Precision libre : horaires, interlocuteur, delai de confirmation. */
  instructions: string;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  provider: '',
  mobileMoneyNumber: '',
  mobileMoneyName: '',
  instructions: '',
};

/** Lisible par une ecole : elle doit savoir ou verser. */
export async function readPaymentSettings(): Promise<PaymentSettings> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_payment_public' as never);
  const ligne = ((data ?? []) as unknown as {
    provider: string | null;
    mobile_money_number: string | null;
    mobile_money_name: string | null;
    instructions: string | null;
  }[])[0];
  return {
    provider: ligne?.provider ?? '',
    mobileMoneyNumber: ligne?.mobile_money_number ?? '',
    mobileMoneyName: ligne?.mobile_money_name ?? '',
    instructions: ligne?.instructions ?? '',
  };
}

/** Le paiement en ligne est-il reellement ouvert ? */
export function onlineOpen(s: PaymentSettings): boolean {
  return s.provider.trim().length > 0;
}

/**
 * Les reglages complets, cote editeur.
 *
 * `readPaymentSettings` n'expose aux ecoles que ce qui les concerne ; ici,
 * c'est la plateforme qui lit et ecrit.
 */
export async function readPaymentSettingsForAdmin(): Promise<PaymentSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_settings').select('settings').eq('namespace', 'billing').maybeSingle();
  const o = (data?.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<string, unknown>;
  const texte = (v: unknown, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    provider: texte(o.provider, 40),
    mobileMoneyNumber: texte(o.mobileMoneyNumber, 40),
    mobileMoneyName: texte(o.mobileMoneyName, 80),
    instructions: texte(o.instructions, 600),
  };
}

export async function writePaymentSettings(userId: string, patch: Partial<PaymentSettings>): Promise<void> {
  const supabase = await createClient();
  const current = await readPaymentSettingsForAdmin();
  const { error } = await supabase.from('platform_settings').upsert(
    { namespace: 'billing', settings: { ...current, ...patch } as never, updated_by: userId },
    { onConflict: 'namespace' },
  );
  if (error) throw error;
}
