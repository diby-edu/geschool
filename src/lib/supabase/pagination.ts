import 'server-only';

/**
 * PostgREST plafonne CHAQUE reponse a un maximum de lignes (constate : 1000),
 * quel que soit le `.range()` demande cote client — `.range(0, 4000)` renvoie
 * quand meme 1000 lignes au plus. Une lecture non paginee d'une table qui peut
 * depasser ce seuil (ex. schedule_sessions d'un grand etablissement) perd donc
 * silencieusement les lignes suivantes. Utiliser cette fonction partout ou le
 * resultat doit etre COMPLET (pas un affichage paginable) : elle boucle par
 * pages jusqu'a une page incomplete.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
