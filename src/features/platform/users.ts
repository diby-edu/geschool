import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from './admin';
import { fetchAllRows } from '@/lib/supabase/pagination';

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
};

export async function listPlatformUsers(search = '', limit = 200): Promise<PlatformUserRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  type Membership = {
    id: string;
    user_id: string;
    status: string;
    schools: { name: string; slug: string } | null;
    membership_roles: { roles: { code: string } | null }[];
    users: { display_name: string | null; email: string | null; phone_e164: string | null; last_login_at: string | null } | null;
  };

  const rows = await fetchAllRows<Membership>((cursor) => {
    let q = supabase
      .from('school_memberships')
      .select(
        'id, user_id, status, schools(name, slug), membership_roles(roles(code)), ' +
          'users(display_name, email, phone_e164, last_login_at)',
      )
      .order('id')
      .limit(500);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Membership[] | null; error: { message: string } | null }>;
  }, 500);

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
      email: u?.email ?? null,
      phone: u?.phone_e164 ?? null,
      lastLogin: dernier,
      idleDays: dernier ? Math.floor((maintenant - new Date(dernier).getTime()) / 86_400_000) : null,
      schools: [ecole],
      suspendedEverywhere: false,
    });
  }

  const terme = search.trim().toLowerCase();
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
        (u.phone ?? '').includes(terme) ||
        u.schools.some((s) => s.name.toLowerCase().includes(terme))
      );
    })
    .sort((a, b) => (b.lastLogin ?? '').localeCompare(a.lastLogin ?? ''))
    .slice(0, limit);
}
