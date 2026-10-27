import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Réglages de la plateforme (lot 6, 2026-10-26), namespace « platform » de
 * platform_settings. Le délai de grâce reste avec les paiements (« billing »),
 * le prix et l'expéditeur des SMS avec les SMS (« sms »).
 */

export type PlatformSettings = {
  /** Nom affiché aux écoles. */
  name: string;
  supportPhone: string;
  supportEmail: string;
  /** Durée de l'essai gratuit d'une nouvelle école, en jours. */
  trialDays: number;
  /** Une école est « à risque » après ce nombre de jours de cours sans activité. */
  riskDays: number;
  /** Taille permise de la base (offre Supabase), en Mo : 500 pour l'offre gratuite (page Technique, lot 7). */
  dbLimitMb: number;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  name: 'Gestion Scolaire',
  supportPhone: '',
  supportEmail: '',
  trialDays: 30,
  riskDays: 2,
  dbLimitMb: 500,
};

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function normalizePlatformSettings(o: Record<string, unknown>): PlatformSettings {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    name: text(o.name, 60) || DEFAULT_PLATFORM_SETTINGS.name,
    supportPhone: text(o.supportPhone, 30),
    supportEmail: text(o.supportEmail, 120),
    trialDays: intIn(o.trialDays, 0, 365, DEFAULT_PLATFORM_SETTINGS.trialDays),
    riskDays: intIn(o.riskDays, 1, 30, DEFAULT_PLATFORM_SETTINGS.riskDays),
    dbLimitMb: intIn(o.dbLimitMb, 100, 1_000_000, DEFAULT_PLATFORM_SETTINGS.dbLimitMb),
  };
}

/** Côté plateforme (lecture réservée par la base aux administrateurs). */
export async function readPlatformSettings(): Promise<PlatformSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_settings').select('settings').eq('namespace', 'platform').maybeSingle();
  return normalizePlatformSettings((data?.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<string, unknown>);
}

export async function writePlatformSettings(userId: string, patch: Partial<PlatformSettings>): Promise<void> {
  const supabase = await createClient();
  const current = await readPlatformSettings();
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ namespace: 'platform', settings: { ...current, ...patch } as never, updated_by: userId }, { onConflict: 'namespace' });
  if (error) throw error;
}

/** Côté école : seulement les coordonnées du support. */
export async function readPlatformContact(): Promise<{ name: string; phone: string; email: string }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_contact_public' as never);
  const row = ((data ?? []) as unknown as { name: string; support_phone: string; support_email: string }[])[0];
  return { name: row?.name || DEFAULT_PLATFORM_SETTINGS.name, phone: row?.support_phone ?? '', email: row?.support_email ?? '' };
}
