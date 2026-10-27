import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { NotFoundError } from '@/lib/errors';
import { isSyntheticEmail } from '@/features/auth/service';
import { accountAttemptKeys, lockedKeys } from '@/services/login-lockout';
import { requireAdmin } from './admin';

/**
 * La fiche d'un compte, vue par le Super Admin (lot 4, maquette
 * docs/maquettes/super-admin-comptes.html) : ses écoles, ses fonctions, son
 * identifiant de connexion, son état (actif, suspendu, bloqué) et ce qui a été
 * fait sur ce compte.
 */

export type AccountSchool = {
  schoolId: string;
  name: string;
  slug: string;
  membershipStatus: string;
  roles: string[];
  access: {
    identifier: string;
    kind: string;
    accountStatus: string;
    activationStatus: string;
  } | null;
  locked: boolean;
};

export type AccountSheet = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lastLogin: string | null;
  schools: AccountSchool[];
  history: { at: string; action: string; school: string | null; byPlatform: boolean }[];
};

export async function getAccountSheet(id: string): Promise<AccountSheet> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: u } = await supabase
    .from('users')
    .select('id, display_name, first_name, last_name, auth_email, contact_email, phone_e164, created_at, last_login_at')
    .eq('id', id)
    .maybeSingle();
  if (!u) throw new NotFoundError('Compte introuvable.');

  const [{ data: ms }, { data: acc }, { data: logs }] = await Promise.all([
    supabase.from('school_memberships').select('status, schools(id, name, slug), membership_roles(roles(code))').eq('user_id', id),
    supabase.from('account_access').select('school_id, login_identifier, subject_kind, account_status, activation_status').eq('user_id', id),
    supabase
      .from('audit_logs')
      .select('created_at, action, actor_is_platform_admin, schools(name)')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  type M = { status: string; schools: { id: string; name: string; slug: string } | null; membership_roles: { roles: { code: string } | null }[] };
  type A = { school_id: string; login_identifier: string; subject_kind: string; account_status: string; activation_status: string };
  const accesses = new Map(((acc ?? []) as A[]).map((a) => [a.school_id, a]));
  const memberships = ((ms ?? []) as unknown as M[]).filter((m) => m.schools);

  const keysBySchool = memberships.map((m) => {
    const a = accesses.get(m.schools!.id);
    return [m.schools!.id, a ? accountAttemptKeys(m.schools!.id, a.login_identifier, u.auth_email) : []] as const;
  });
  const locked = await lockedKeys(keysBySchool.flatMap(([, k]) => k));

  const phone = u.phone_e164 ?? ((acc ?? []) as A[]).find((a) => a.login_identifier.startsWith('+'))?.login_identifier ?? null;
  return {
    id: u.id,
    name: `${(u.last_name ?? '').toUpperCase()} ${u.first_name ?? ''}`.trim() || u.display_name || '(sans nom)',
    email: u.contact_email ?? (u.auth_email && !isSyntheticEmail(u.auth_email) ? u.auth_email : null),
    phone,
    createdAt: u.created_at,
    lastLogin: u.last_login_at,
    schools: memberships.map((m) => {
      const a = accesses.get(m.schools!.id);
      return {
        schoolId: m.schools!.id,
        name: m.schools!.name,
        slug: m.schools!.slug,
        membershipStatus: m.status,
        roles: m.membership_roles.map((r) => r.roles?.code).filter((c): c is string => !!c),
        access: a
          ? { identifier: a.login_identifier, kind: a.subject_kind, accountStatus: a.account_status, activationStatus: a.activation_status }
          : null,
        locked: (keysBySchool.find(([s]) => s === m.schools!.id)?.[1] ?? []).some((k) => locked.has(k)),
      };
    }),
    history: ((logs ?? []) as unknown as { created_at: string; action: string; actor_is_platform_admin: boolean; schools: { name: string } | null }[]).map(
      (l) => ({ at: l.created_at, action: l.action, school: l.schools?.name ?? null, byPlatform: l.actor_is_platform_admin }),
    ),
  };
}

export type OrphanAccount = { id: string; email: string | null; createdAt: string; lastLogin: string | null };

/**
 * Comptes rattachés à aucune école (inscription abandonnée, essai) et qui ne
 * sont pas Super Admin : ils ne peuvent servir à rien.
 */
export async function listOrphanAccounts(): Promise<OrphanAccount[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: admins }] = await Promise.all([
    supabase
      .from('users')
      .select('id, auth_email, created_at, last_login_at, school_memberships!left(id)')
      .is('school_memberships', null)
      .order('created_at')
      .limit(500),
    supabase.from('platform_admins').select('user_id'),
  ]);
  if (error) throw error;
  const adminIds = new Set(((admins ?? []) as { user_id: string }[]).map((a) => a.user_id));
  return ((data ?? []) as unknown as { id: string; auth_email: string | null; created_at: string; last_login_at: string | null }[])
    .filter((u) => !adminIds.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.auth_email && !isSyntheticEmail(u.auth_email) ? u.auth_email : null,
      createdAt: u.created_at,
      lastLogin: u.last_login_at,
    }));
}
