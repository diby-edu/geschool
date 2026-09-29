/**
 * Noms des classes créées depuis un niveau.
 *
 * Une école crée rarement une classe à la fois : elle ouvre « quinze sixièmes »
 * d'un coup. Le nom se compose donc du niveau et d'un suffixe — un chiffre ou
 * une lettre — et l'écran montre la liste exacte avant de valider.
 *
 *   nom court  = code du niveau + suffixe   (6EME 1)   identifiant des listes
 *   nom long   = nom du niveau + suffixe    (Sixième 1) nom affiché
 *
 * Sans suffixe, la classe porte le nom du niveau seul : le cas d'une école qui
 * n'a qu'une seule sixième.
 */

export type NumberingKind = 'DIGITS' | 'LETTERS';

export type ClassNamePlan = { suffix: string; code: string; name: string };

/** A, B, … Z, puis AA, AB… — au-delà de vingt-six classes d'un même niveau. */
export function letterSuffix(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function suffixesFor(count: number, numbering: NumberingKind): string[] {
  const safe = Math.max(0, Math.min(count, 60));
  return Array.from({ length: safe }, (_, i) => (numbering === 'LETTERS' ? letterSuffix(i) : String(i + 1)));
}

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

/** Un nom de classe : le niveau, puis le suffixe s'il y en a un. */
export function classNames(levelCode: string, levelName: string, suffix: string): ClassNamePlan {
  const s = clean(suffix);
  const code = (s ? `${clean(levelCode)} ${s}` : clean(levelCode)).toUpperCase().slice(0, 20);
  const name = (s ? `${clean(levelName)} ${s}` : clean(levelName)).slice(0, 80);
  return { suffix: s, code, name };
}

/** La liste complète de ce qui va être créé, dans l'ordre. */
export function planClasses(input: {
  levelCode: string;
  levelName: string;
  mode: 'ONE' | 'MANY';
  suffix?: string;
  count?: number;
  numbering?: NumberingKind;
}): ClassNamePlan[] {
  if (input.mode === 'ONE') return [classNames(input.levelCode, input.levelName, input.suffix ?? '')];
  return suffixesFor(input.count ?? 0, input.numbering ?? 'DIGITS').map((s) =>
    classNames(input.levelCode, input.levelName, s),
  );
}
