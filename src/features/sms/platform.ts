import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Les réglages SMS de l'éditeur, communs à tous les établissements.
 *
 * Le prix d'un SMS, le nom d'expéditeur de secours, et l'adresse à qui
 * envoyer les dossiers de validation. Rangés dans `platform_settings`, que les
 * écoles ne peuvent pas lire (migration 0088).
 */

export type PlatformSms = {
  /** Prix d'un SMS, dans la monnaie de la plateforme. */
  pricePerSms: number;
  /** Le nom déjà approuvé chez l'opérateur, prêté aux écoles qui attendent le leur. */
  fallbackSender: string;
  /** Où partent les dossiers de validation de nom d'expéditeur. */
  senderRequestEmail: string;
  /** Au-delà, l'envoi groupé demande une confirmation. */
  confirmAboveAmount: number;
};

export const DEFAULT_PLATFORM_SMS: PlatformSms = {
  pricePerSms: 15,
  fallbackSender: 'WazzapAI',
  senderRequestEmail: '',
  confirmAboveAmount: 5000,
};

export async function readPlatformSms(): Promise<PlatformSms> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_settings').select('settings').eq('namespace', 'sms').maybeSingle();
  return clean(data?.settings);
}

/**
 * Ce qu'un établissement a le droit de savoir : le nom qu'il emprunte, et le
 * prix qu'on lui facture. Le reste des réglages de l'éditeur lui reste fermé.
 *
 * Passe par une fonction en base plutôt que par une clé de service : contourner
 * les règles d'accès pour lire deux champs serait disproportionné.
 */
export async function readSenderForSchool(): Promise<{ fallbackSender: string; pricePerSms: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_sms_public' as never);
  const ligne = ((data ?? []) as unknown as { fallback_sender: string; price_per_sms: number }[])[0];
  return {
    fallbackSender: ligne?.fallback_sender || DEFAULT_PLATFORM_SMS.fallbackSender,
    pricePerSms: ligne ? Number(ligne.price_per_sms) : DEFAULT_PLATFORM_SMS.pricePerSms,
  };
}

export async function writePlatformSms(userId: string, patch: Partial<PlatformSms>): Promise<void> {
  const supabase = await createClient();
  const current = await readPlatformSms();
  const { error } = await supabase.from('platform_settings').upsert(
    { namespace: 'sms', settings: { ...current, ...patch } as never, updated_by: userId },
    { onConflict: 'namespace' },
  );
  if (error) throw error;
}

function clean(raw: unknown): PlatformSms {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nombre = (v: unknown, defaut: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : defaut;
  };
  const texte = (v: unknown, defaut: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : defaut);
  return {
    pricePerSms: nombre(o.pricePerSms, DEFAULT_PLATFORM_SMS.pricePerSms, 10_000),
    fallbackSender: texte(o.fallbackSender, DEFAULT_PLATFORM_SMS.fallbackSender),
    senderRequestEmail: texte(o.senderRequestEmail, DEFAULT_PLATFORM_SMS.senderRequestEmail),
    confirmAboveAmount: nombre(o.confirmAboveAmount, DEFAULT_PLATFORM_SMS.confirmAboveAmount, 10_000_000),
  };
}
