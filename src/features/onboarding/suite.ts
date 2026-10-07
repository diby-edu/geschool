/**
 * L'enchainement de la mise en route.
 *
 * Quand on arrive sur un ecran DEPUIS la liste « Mise en route », on veut y
 * revenir sitot l'etape faite, pour enchainer la suivante — pas atterrir sur
 * la fiche de ce qu'on vient de creer et devoir retrouver son chemin.
 *
 * Le marqueur voyage dans l'URL (`?suite=demarrage`), puis dans le formulaire
 * (un champ cache), puis guide la redirection. Module NEUTRE : lisible depuis
 * un composant client comme depuis une action serveur.
 */

export const SUITE = 'demarrage';

type Sp = Record<string, string | string[] | undefined>;

/** Vient-on de la mise en route ? */
export function fromStartup(sp: Sp): boolean {
  const v = sp.suite;
  return (Array.isArray(v) ? v[0] : v) === SUITE;
}

/** Le marqueur a transmettre dans un formulaire, ou rien. */
export function suiteValue(sp: Sp): string | null {
  return fromStartup(sp) ? SUITE : null;
}

/**
 * Ou renvoyer apres l'action.
 *
 * Depuis la mise en route, on ne repasse PAS par la liste : revenir cocher la
 * ligne puis cliquer la suivante fait deux gestes de trop. On repart vers la
 * page de mise en route avec `?suivante=1`, qui renvoie aussitot sur la
 * premiere etape encore a faire — une seule page connait l'ordre.
 */
export function afterStep(slug: string, fd: FormData, defaut: string): string {
  return String(fd.get('suite') ?? '') === SUITE ? `/e/${slug}/demarrage?suivante=1` : defaut;
}
