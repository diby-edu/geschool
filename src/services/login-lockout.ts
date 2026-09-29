import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Verrouillage apres essais de connexion rates.
 *
 * Le code ecole et le telephone ne sont pas des secrets : seul le mot de passe
 * protege un compte. Apres MAX_FAILURES echecs en WINDOW_MINUTES sur la meme
 * cle (code ecole + identifiant, ou email), les tentatives suivantes sont
 * refusees jusqu'a la fin de la fenetre.
 *
 * Les echecs sont comptes que le compte existe ou non : le verrouillage ne
 * revele rien sur l'existence d'un compte. Contrepartie assumee : quelqu'un qui
 * connait un identifiant peut le verrouiller 15 minutes ; la fenetre courte
 * limite la gene.
 */

export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;
export const LOCKED_MESSAGE = `Trop de tentatives. Réessayez dans ${WINDOW_MINUTES} minutes.`;

/** Cle stable d'une tentative : minuscules, sans espaces. */
export function attemptKey(...parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase().replace(/\s+/g, '')).join(':');
}

async function callerIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

export async function isLockedOut(key: string): Promise<boolean> {
  const admin = createAdminClient('auth.login_attempts');
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_key', key)
    .gt('created_at', since);
  return (count ?? 0) >= MAX_FAILURES;
}

export async function recordFailure(key: string): Promise<void> {
  const admin = createAdminClient('auth.login_attempts');
  await admin.from('login_attempts').insert({ attempt_key: key, ip_address: await callerIp() });
  // Menage opportuniste : le journal ne doit pas grossir sans fin.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    await admin.from('login_attempts').delete().lt('created_at', cutoff);
  }
}

export async function clearFailures(key: string): Promise<void> {
  const admin = createAdminClient('auth.login_attempts');
  await admin.from('login_attempts').delete().eq('attempt_key', key);
}
