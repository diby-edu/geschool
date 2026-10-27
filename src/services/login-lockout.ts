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

/**
 * Les clés d'un compte dans une école : connexion par code école (ou lien de
 * l'école) avec son identifiant, et connexion par e-mail si c'en est un. Même
 * écriture que src/features/auth/actions.ts (identifiant déjà normalisé en base).
 */
export function accountAttemptKeys(schoolId: string, identifier: string, authEmail?: string | null): string[] {
  const keys = [attemptKey('school', schoolId, identifier)];
  if (identifier.includes('@')) keys.push(attemptKey('email', identifier));
  if (authEmail && authEmail !== identifier) keys.push(attemptKey('email', authEmail));
  return keys;
}

/** Parmi ces clés, celles bloquées en ce moment (une seule lecture). */
export async function lockedKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const admin = createAdminClient('auth.login_attempts');
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await admin.from('login_attempts').select('attempt_key').in('attempt_key', keys).gt('created_at', since);
  const count = new Map<string, number>();
  for (const r of (data ?? []) as { attempt_key: string }[]) count.set(r.attempt_key, (count.get(r.attempt_key) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= MAX_FAILURES).map(([k]) => k));
}

/** Débloquer : effacer les essais ratés de ces clés. Le droit est vérifié par l'appelant. */
export async function clearFailuresFor(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const admin = createAdminClient('auth.login_attempts');
  const { error } = await admin.from('login_attempts').delete().in('attempt_key', keys);
  if (error) throw error;
}

/** Toutes les clés bloquées en ce moment (la table ne garde que les échecs récents). */
export async function allLockedKeys(): Promise<Set<string>> {
  const admin = createAdminClient('auth.login_attempts');
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await admin.from('login_attempts').select('attempt_key').gt('created_at', since).limit(20000);
  const count = new Map<string, number>();
  for (const r of (data ?? []) as { attempt_key: string }[]) count.set(r.attempt_key, (count.get(r.attempt_key) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= MAX_FAILURES).map(([k]) => k));
}
