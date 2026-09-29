/**
 * Noms et codes des salles créées en série.
 *
 * Une école ne crée pas « une salle » : elle crée dix salles de classe d'un
 * bâtiment, ou six ateliers. Comme pour les classes, on saisit un nom de base
 * et un nombre, et l'on voit la liste exacte avant de valider.
 */

export type NumberingKind = 'DIGITS' | 'LETTERS';

export type RoomNamePlan = { code: string; name: string };

export function letterSuffix(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

/** Code court dérivé du nom : « Salle de classe 3 » → « SALLE-DE-CLASSE-3 ». */
export function roomCode(name: string): string {
  return clean(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

/**
 * La liste des salles à créer. En mode « une seule », le nom est pris tel quel.
 * En série, on ajoute le suffixe : « Salle 1 », « Salle 2 »… ou « Salle A »…
 */
export function planRooms(input: {
  baseName: string;
  mode: 'ONE' | 'MANY';
  count?: number;
  numbering?: NumberingKind;
  startAt?: number;
}): RoomNamePlan[] {
  const base = clean(input.baseName);
  if (!base) return [];
  if (input.mode === 'ONE') return [{ code: roomCode(base), name: base }];

  const count = Math.max(0, Math.min(input.count ?? 0, 100));
  const start = Math.max(1, input.startAt ?? 1);
  return Array.from({ length: count }, (_, i) => {
    const suffix = input.numbering === 'LETTERS' ? letterSuffix(start - 1 + i) : String(start + i);
    const name = `${base} ${suffix}`;
    return { code: roomCode(name), name };
  });
}
