import 'server-only';

/**
 * PostgREST plafonne CHAQUE reponse a un maximum de lignes (constate : 1000),
 * quel que soit le `.range()` demande cote client — `.range(0, 4000)` renvoie
 * quand meme 1000 lignes au plus. Une lecture non paginee d'une table qui peut
 * depasser ce seuil (ex. schedule_sessions d'un grand etablissement) perd donc
 * silencieusement les lignes suivantes. Utiliser cette fonction partout ou le
 * resultat doit etre COMPLET (pas un affichage paginable).
 *
 * Pagination par CURSEUR (keyset, `where id > cursor order by id limit N`),
 * PAS par decalage (`.range(from, to)`) : sur une table dont la policy RLS
 * est couteuse par ligne (fonction SECURITY DEFINER a sous-requetes
 * correlees, ex. schedule_sessions/app.can_see_session), un `.range()` a
 * decalage oblige Postgres a re-evaluer la RLS de TOUTES les lignes sautees
 * avant de rendre la page — le cout grandit avec chaque page (mesure : la
 * page 1 (lignes 0-199) prend ~1s, mais lire jusqu'a la ligne ~800 depasse
 * deja le statement_timeout). Le curseur n'a jamais a sauter de lignes : le
 * cout par page reste constant quelle que soit sa profondeur (mesure : ~1.2s
 * par page de 200, stable sur 11 pages/2072 lignes).
 *
 * `id` doit etre une colonne a tri total (cle primaire) : `run` doit trier
 * par elle (et seulement par elle, ou en dernier critere si un autre tri
 * d'affichage est voulu — trier alors le resultat complet cote client).
 */
const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows<T extends { id: string }>(
  run: (cursor: string | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { data, error } = await run(cursor);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1]!.id;
  }
  return all;
}
