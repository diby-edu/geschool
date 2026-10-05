/**
 * Le code d'un bareme ou d'un type d'evaluation se DEDUIT de son nom.
 *
 * « Code », pour un directeur, ne veut rien dire : c'est un repere interne que
 * l'application utilise pour ne pas confondre deux lignes. Le demander, c'est
 * faire inventer un mot technique a quelqu'un qui voulait juste ecrire
 * « Notes sur 20 ».
 *
 * Module NEUTRE : utilisable depuis un composant client comme depuis un test.
 */

export const CODE_MAX = 30;

export function codeFromName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, CODE_MAX);
  return base || 'REPERE';
}

/** Un code deja pris recoit un suffixe : on ne refuse jamais un nom a l'ecole. */
export function uniqueCode(name: string, taken: Iterable<string>): string {
  const pris = new Set(taken);
  const base = codeFromName(name);
  if (!pris.has(base)) return base;
  let n = 2;
  while (pris.has(`${base.slice(0, CODE_MAX - 3)}_${n}`)) n += 1;
  return `${base.slice(0, CODE_MAX - 3)}_${n}`;
}
