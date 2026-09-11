/**
 * Outils de liste serveur : recherche, tri et pagination via l'URL
 * (searchParams). Le rendu reste un Server Component — aucune donnee ne part au
 * navigateur au-dela de la page affichee, ce qui tient la promesse de
 * performance du §62 (pagination serveur, jamais toute la table).
 */

export type ListParams = {
  q: string;
  sort: string | null;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  /** bornes pour supabase .range(from, to) */
  from: number;
  to: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * @param sortable liste blanche des colonnes triables. Un `sort` hors liste est
 *   ignore — on ne laisse jamais l'URL choisir une colonne de tri arbitraire.
 */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  opts: { sortable: readonly string[]; defaultSort?: string; pageSize?: number },
): ListParams {
  const pick = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, Number.parseInt(pick('page') ?? '1', 10) || 1);

  const rawSort = pick('sort') ?? opts.defaultSort ?? null;
  const sort = rawSort && opts.sortable.includes(rawSort) ? rawSort : (opts.defaultSort ?? null);
  const dir = pick('dir') === 'desc' ? 'desc' : 'asc';

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { q: (pick('q') ?? '').trim(), sort, dir, page, pageSize, from, to };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Construit une querystring en fusionnant des surcharges sur l'existant. */
export function mergeQuery(
  current: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v === undefined) continue;
    params.set(k, Array.isArray(v) ? (v[0] ?? '') : v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined || v === '') params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}
