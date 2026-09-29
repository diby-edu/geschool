import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import { personName } from '@/lib/person-name';

/**
 * Statuts affiches dans « Gestion des acces ». Volontairement exclusifs : un
 * acces suspendu n'est plus compte comme active ni comme non active, comme dans
 * la colonne « Activation » du tableau. Leur somme fait donc le total.
 */
export const STATUS_FILTERS = ['NOT_ACTIVATED', 'ACTIVATED', 'SUSPENDED'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const KIND_FILTERS = ['TEACHER', 'GUARDIAN', 'STAFF'] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

export type AccessFilters = { kind?: KindFilter | undefined; status?: StatusFilter | undefined; q?: string | undefined };

export type AccessOverview = {
  /** Comptes par statut, dans le type choisi. `ALL` = tous statuts. */
  byStatus: Record<'ALL' | StatusFilter, number>;
  /** Comptes par type, dans le statut choisi. `ALL` = tous types. */
  byKind: Record<'ALL' | KindFilter, number>;
  sms: { pending: number; sent: number; failed: number };
};

export type AccessRow = {
  /** Cle de ligne (account_access.id) ; les actions ciblent `user_id`. */
  id: string;
  user_id: string;
  name: string;
  subject_kind: string;
  login_identifier: string;
  activation_status: string;
  account_status: string;
  delivery_count: number;
  has_pending: boolean;
};

type Filterable<T> = {
  filter(column: string, operator: string, value: unknown): T;
  or(filters: string, options?: { referencedTable?: string }): T;
};

function applyKind<T extends Filterable<T>>(q: T, kind: KindFilter | undefined): T {
  return kind ? q.filter('subject_kind', 'eq', kind) : q;
}

function applyStatus<T extends Filterable<T>>(q: T, status: StatusFilter | undefined): T {
  switch (status) {
    case 'SUSPENDED':
      return q.filter('account_status', 'eq', 'SUSPENDED');
    case 'ACTIVATED':
      return q.filter('activation_status', 'eq', 'ACTIVATED').filter('account_status', 'neq', 'SUSPENDED');
    case 'NOT_ACTIVATED':
      return q.filter('activation_status', 'neq', 'ACTIVATED').filter('account_status', 'neq', 'SUSPENDED');
    default:
      return q;
  }
}

/**
 * Mots de la recherche, nettoyes : la saisie est inseree dans des filtres
 * PostgREST ou virgules, parentheses et jokers (`%`, `*`, `_`) changeraient le
 * sens du filtre. On ne garde que lettres, chiffres et les signes utiles a un
 * nom, un e-mail ou un numero. Les separateurs entre chiffres sont retires pour
 * qu'un numero saisi « 07 08 09 » se cherche comme « 070809 ».
 */
function searchTerms(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/(?<=\d)[\s.-]+(?=\d)/g, '')
    .replace(/[^\p{L}\p{N}\s@.+'-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.'+-]+|[.'-]+$/g, '').slice(0, 40))
    .filter((t) => t.length > 0)
    .slice(0, 4);
}

/** Un mot avec chiffre, `@`, `.` ou `+` cherche l'identifiant (telephone, e-mail) ; sinon, le nom. */
const isIdentifierTerm = (t: string) => /[\d@.+]/.test(t);

/**
 * Chaque mot doit etre retrouve : « koffi 0708 » = Koffi dont le numero contient
 * 0708. PostgREST n'accepte pas de melanger colonnes de la table et de la
 * personne dans un meme `or`, d'ou le routage par mot : l'identifiant se filtre
 * sur la table, le nom sur la jointure interne (`users`).
 */
function applySearch<T extends Filterable<T>>(q: T, terms: string[]): T {
  let out = q;
  for (const t of terms) {
    out = isIdentifierTerm(t)
      ? out.filter('login_identifier', 'ilike', `%${t}%`)
      : out.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,display_name.ilike.%${t}%`, {
          referencedTable: 'users',
        });
  }
  return out;
}

async function countAccess(ctx: TenantContext, kind: KindFilter | undefined, status: StatusFilter | undefined) {
  const supabase = await createClient();
  const q = supabase
    .from('account_access')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', ctx.school.id);
  const { count } = await applyStatus(applyKind(q, kind), status);
  return count ?? 0;
}

async function countDeliveries(ctx: TenantContext, status: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('credential_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', ctx.school.id)
    .eq('status', status as never);
  return count ?? 0;
}

/** Compteurs des tuiles et des pastilles, tous calcules pour le filtre en cours. */
export async function getOverview(
  ctx: TenantContext,
  filters: Pick<AccessFilters, 'kind' | 'status'>,
): Promise<AccessOverview> {
  const [all, notActivated, activated, suspended, kAll, teachers, guardians, staff, pending, sent, failed] =
    await Promise.all([
      countAccess(ctx, filters.kind, undefined),
      countAccess(ctx, filters.kind, 'NOT_ACTIVATED'),
      countAccess(ctx, filters.kind, 'ACTIVATED'),
      countAccess(ctx, filters.kind, 'SUSPENDED'),
      countAccess(ctx, undefined, filters.status),
      countAccess(ctx, 'TEACHER', filters.status),
      countAccess(ctx, 'GUARDIAN', filters.status),
      countAccess(ctx, 'STAFF', filters.status),
      countDeliveries(ctx, 'PENDING'),
      countDeliveries(ctx, 'SENT'),
      countDeliveries(ctx, 'FAILED'),
    ]);
  return {
    byStatus: { ALL: all, NOT_ACTIVATED: notActivated, ACTIVATED: activated, SUSPENDED: suspended },
    byKind: { ALL: kAll, TEACHER: teachers, GUARDIAN: guardians, STAFF: staff },
    sms: { pending, sent, failed },
  };
}

/**
 * Une page d'acces. Tri par creation decroissante avec `id` en departage : sans
 * cle unique, les lignes creees dans la meme seconde (envoi en lot) changent de
 * page d'un appel a l'autre et certaines se perdent (cf. correctif de
 * pagination de l'emploi du temps).
 */
export async function listAccounts(
  ctx: TenantContext,
  filters: AccessFilters,
  page: Pick<ListParams, 'from' | 'to'>,
): Promise<{ rows: AccessRow[]; total: number }> {
  const supabase = await createClient();
  const terms = searchTerms(filters.q);
  // Une recherche par nom filtre sur la personne : jointure interne. Sinon,
  // jointure externe, pour qu'un acces sans fiche lisible reste liste.
  const embed = terms.some((t) => !isIdentifierTerm(t)) ? '!inner' : '';
  const users = `users!account_access_user_id_fkey${embed}(display_name, first_name, last_name)`;

  const base = supabase
    .from('account_access')
    .select(`id, user_id, subject_kind, login_identifier, activation_status, account_status, delivery_count, ${users}`, {
      count: 'exact',
    })
    .eq('school_id', ctx.school.id);
  const { data, error, count } = await applySearch(applyStatus(applyKind(base, filters.kind), filters.status), terms)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(page.from, page.to);

  if (error) {
    // Page au-dela de la fin : le total a baisse pendant la consultation (un
    // acces vient d'etre active, par exemple). L'appelant renvoie a la derniere
    // page ; le total est recompte ici, une erreur 416 n'en porte pas.
    if (error.code === 'PGRST103') {
      const head = supabase
        .from('account_access')
        .select(`id, ${users}`, { count: 'exact', head: true })
        .eq('school_id', ctx.school.id);
      const { count: total } = await applySearch(applyStatus(applyKind(head, filters.kind), filters.status), terms);
      return { rows: [], total: total ?? 0 };
    }
    throw error;
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    user_id: string;
    subject_kind: string;
    login_identifier: string;
    activation_status: string;
    account_status: string;
    delivery_count: number;
    users: { display_name: string | null; first_name: string; last_name: string } | null;
  }[];

  // Envois en attente ou en echec, pour les seuls comptes de la page.
  let pendingSet = new Set<string>();
  if (rows.length > 0) {
    const { data: pend } = await supabase
      .from('credential_deliveries')
      .select('user_id')
      .eq('school_id', ctx.school.id)
      .in('status', ['PENDING', 'FAILED'])
      .in('user_id', rows.map((r) => r.user_id));
    pendingSet = new Set((pend ?? []).map((p) => p.user_id));
  }

  return {
    total: count ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: personName(r.users),
      subject_kind: r.subject_kind,
      login_identifier: r.login_identifier,
      activation_status: r.activation_status,
      account_status: r.account_status,
      delivery_count: r.delivery_count,
      has_pending: pendingSet.has(r.user_id),
    })),
  };
}
