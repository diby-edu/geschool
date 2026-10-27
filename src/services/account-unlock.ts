import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';
import type { TenantContext } from '@/lib/tenant/context';
import { accountAttemptKeys, clearFailuresFor, lockedKeys } from './login-lockout';

/**
 * Débloquer un compte après 5 essais ratés (0145, décidé le 2026-10-26) :
 * c'est le travail de l'Informaticien de l'école, avec le droit
 * `access_accounts.unlock`. Le Super Admin peut aussi le faire (il a tous les
 * droits dans le contexte de l'école).
 */
export async function unlockAccount(ctx: TenantContext, userId: string): Promise<void> {
  requireWritable(ctx, 'access_accounts.unlock');
  const supabase = await createClient();
  // Deux lectures : account_access pointe deux fois vers users (la personne et
  // l'auteur), une jointure serait ambiguë.
  const [{ data: access }, { data: user }] = await Promise.all([
    supabase.from('account_access').select('login_identifier').eq('school_id', ctx.school.id).eq('user_id', userId).maybeSingle(),
    supabase.from('users').select('auth_email').eq('id', userId).maybeSingle(),
  ]);
  if (!access) throw new NotFoundError('Compte introuvable dans cette école.');
  await clearFailuresFor(accountAttemptKeys(ctx.school.id, access.login_identifier, user?.auth_email));
  await audit(ctx, { action: 'access.unlock', module: 'access', entityType: 'user', entityId: userId });
}

/** Parmi ces comptes d'une école, ceux bloqués en ce moment (une seule lecture). */
export async function lockedUserIds(schoolId: string, rows: { user_id: string; login_identifier: string }[]): Promise<Set<string>> {
  const keysByUser = rows.map((r) => [r.user_id, accountAttemptKeys(schoolId, r.login_identifier)] as const);
  const locked = await lockedKeys(keysByUser.flatMap(([, k]) => k));
  return new Set(keysByUser.filter(([, k]) => k.some((x) => locked.has(x))).map(([u]) => u));
}
