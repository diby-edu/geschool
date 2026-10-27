import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from './admin';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { isSyntheticEmail } from '@/features/auth/service';
import { accountAttemptKeys, allLockedKeys, attemptKey } from '@/services/login-lockout';

/**
 * Tous les comptes de la plateforme, vus par l'éditeur.
 *
 * Jusqu'ici, chercher un compte supposait de savoir dans quelle école il se
 * trouve — ce qui est précisément ce qu'on ignore quand quelqu'un écrit « je
 * n'arrive plus à me connecter » depuis une adresse qu'on ne reconnaît pas.
 *
 * Lecture par le client RLS : seul un administrateur de la plateforme voit ces
 * lignes, et c'est la base qui le garantit.
 */

export type PlatformUserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lastLogin: string | null;
  /** Jours depuis la dernière connexion ; null = jamais connecté. */
  idleDays: number | null;
  schools: { name: string; slug: string; roles: string[]; status: string }[];
  /** Compte suspendu dans TOUS ses établissements. */
  suspendedEverywhere: boolean;
  /** Ce qu'est la personne, dans au moins une école. */
  kinds: AccountKind[];
  /** Bloqué en ce moment après 5 essais ratés (dans au moins une école). */
  locked: boolean;
};

export type AccountKind = 'STAFF' | 'TEACHER' | 'GUARDIAN';

/** Les filtres de la page Comptes (lot 4, 2026-10-26). */
export const ACCOUNT_FILTERS = ['STAFF', 'TEACHER', 'GUARDIAN', 'NEVER', 'LOCKED', 'SUSPENDED'] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];

export function matchesFilter(u: PlatformUserRow, f: AccountFilter): boolean {
  if (f === 'NEVER') return u.idleDays === null;
  if (f === 'LOCKED') return u.locked;
  if (f === 'SUSPENDED') return u.schools.some((s) => s.status !== 'ACTIVE');
  return u.kinds.includes(f);
}

export async function listPlatformUsers(search = '', limit = 200): Promise<PlatformUserRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  type Membership = {
    id: string;
    user_id: string;
    status: string;
    schools: { name: string; slug: string } | null;
    membership_roles: { roles: { code: string } | null }[];
    users: {
      display_name: string | null;
      auth_email: string | null;
      contact_email: string | null;
      phone_e164: string | null;
      last_login_at: string | null;
    } | null;
  };

  const rows = await fetchAllRows<Membership>((cursor) => {
    let q = supabase
      .from('school_memberships')
      .select(
        'id, user_id, status, schools(name, slug), membership_roles(roles(code)), ' +
          'users(display_name, auth_email, contact_email, phone_e164, last_login_at)',
      )
      .order('id')
      .limit(500);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Membership[] | null; error: { message: string } | null }>;
  }, 500);

  // Le téléphone d'un parent ou d'un enseignant est son IDENTIFIANT de connexion
  // (account_access) : la fiche `users` n'en a souvent pas. Sans lui, chercher
  // « 0700000006 » ne trouvait personne.
  type Login = { id: string; user_id: string; school_id: string; login_identifier: string; subject_kind: string };
  const [logins, lockedNow] = await Promise.all([
    fetchAllRows<Login>((cursor) => {
      let q = supabase.from('account_access').select('id, user_id, school_id, login_identifier, subject_kind').order('id').limit(1000);
      if (cursor) q = q.gt('id', cursor);
      return q as unknown as PromiseLike<{ data: Login[] | null; error: { message: string } | null }>;
    }),
    allLockedKeys(),
  ]);
  const phoneOf = new Map<string, string>();
  const kindsOf = new Map<string, Set<AccountKind>>();
  const lockedUsers = new Set<string>();
  for (const a of logins) {
    if (a.login_identifier.startsWith('+')) phoneOf.set(a.user_id, a.login_identifier);
    if (a.subject_kind === 'STAFF' || a.subject_kind === 'TEACHER' || a.subject_kind === 'GUARDIAN') {
      kindsOf.set(a.user_id, (kindsOf.get(a.user_id) ?? new Set()).add(a.subject_kind));
    }
    if (lockedNow.size > 0 && accountAttemptKeys(a.school_id, a.login_identifier).some((k) => lockedNow.has(k))) lockedUsers.add(a.user_id);
  }

  const parUser = new Map<string, PlatformUserRow>();
  const maintenant = Date.now();

  for (const m of rows) {
    const u = m.users;
    const existant = parUser.get(m.user_id);
    const ecole = {
      name: m.schools?.name ?? '—',
      slug: m.schools?.slug ?? '',
      roles: m.membership_roles.map((mr) => mr.roles?.code).filter((c): c is string => !!c),
      status: m.status,
    };

    if (existant) {
      existant.schools.push(ecole);
      continue;
    }
    const dernier = u?.last_login_at ?? null;
    parUser.set(m.user_id, {
      id: m.user_id,
      name: u?.display_name ?? '—',
      // Adresse de contact, sinon celle de connexion — sauf si celle-ci est synthétique (compte sans e-mail).
      email: u?.contact_email ?? (u?.auth_email && !isSyntheticEmail(u.auth_email) ? u.auth_email : null),
      phone: u?.phone_e164 ?? phoneOf.get(m.user_id) ?? null,
      lastLogin: dernier,
      idleDays: dernier ? Math.floor((maintenant - new Date(dernier).getTime()) / 86_400_000) : null,
      schools: [ecole],
      suspendedEverywhere: false,
      kinds: [...(kindsOf.get(m.user_id) ?? [])],
      locked: lockedUsers.has(m.user_id) || (!!u?.auth_email && lockedNow.has(attemptKey('email', u.auth_email))),
    });
  }

  const terme = search.trim().toLowerCase();
  // Un numéro se compare chiffres seuls : « 07 00 00 00 06 », « 0700000006 » et
  // « +225 07… » désignent la même personne.
  const chiffres = terme.replace(/\D/g, '');
  return [...parUser.values()]
    .map((u) => ({
      ...u,
      // Suspendu partout : le compte ne sert plus nulle part, et c'est souvent
      // la réponse à « pourquoi je n'arrive plus à entrer ».
      suspendedEverywhere: u.schools.length > 0 && u.schools.every((s) => s.status !== 'ACTIVE'),
    }))
    .filter((u) => {
      if (!terme) return true;
      return (
        u.name.toLowerCase().includes(terme) ||
        (u.email ?? '').toLowerCase().includes(terme) ||
        (chiffres.length >= 4 && (u.phone ?? '').replace(/\D/g, '').includes(chiffres)) ||
        u.schools.some((s) => s.name.toLowerCase().includes(terme))
      );
    })
    .sort((a, b) => (b.lastLogin ?? '').localeCompare(a.lastLogin ?? ''))
    .slice(0, limit);
}
