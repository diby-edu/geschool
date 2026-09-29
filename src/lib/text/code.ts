/**
 * Code court dérivé d'un nom saisi : « Cuisine pédagogique » → « CUISINE-PEDAGOGIQUE ».
 *
 * Sert partout où l'établissement crée ses propres listes (types de salle,
 * équipements, motifs d'incident, sanctions) : la personne tape un nom, le code
 * suit tout seul et reste modifiable.
 */
export function suggestCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}
