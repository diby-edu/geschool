import 'server-only';

/**
 * PostgREST plafonne CHAQUE reponse a un maximum de lignes (constate : 1000),
 * quel que soit le `.range()` demande cote client — `.range(0, 4000)` renvoie
 * quand meme 1000 lignes au plus. Une lecture non paginee d'une table qui peut
 * depasser ce seuil (ex. schedule_sessions d'un grand etablissement) perd donc
 * silencieusement les lignes suivantes. Utiliser cette fonction partout ou le
 * resultat doit etre COMPLET (pas un affichage paginable) : elle boucle par
 * pages jusqu'a une page incomplete.
 *
 * `pageSize` (defaut 1000, le plafond PostgREST) peut etre reduit pour une
 * table dont la policy RLS est couteuse par ligne (fonction SECURITY DEFINER
 * avec sous-requetes correlees) : mesure sur schedule_sessions (policy
 * app.can_see_session, jointures multiples), une page de 1000 lignes avec ses
 * relations imbriquees peut a elle seule depasser le statement_timeout
 * Postgres — une page de 200 reste a marge confortable (~1-2s).
 */
const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await run(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
