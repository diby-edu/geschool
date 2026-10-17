/**
 * Mise en page d'un emploi du temps imprimable : une grille LIGNES (créneaux et
 * pauses) × COLONNES (jours), comme sur les maquettes validées (classe et
 * professeur, A4 paysage).
 *
 * Fonction pure (testée dans print-layout.test.ts) :
 *   - les lignes sont les créneaux de la grille de l'école (ou de ses grilles de
 *     cycle) ; un jour qui n'a pas un créneau le montre grisé ;
 *   - un cours de 2 h ou plus occupe plusieurs lignes d'un seul tenant ;
 *   - deux cours au même moment (ne devrait pas arriver) restent tous deux visibles ;
 *   - le volume compte une heure par créneau occupé : 1 cours = 1 heure.
 */

export type Band = { day: number; start: string; end: string; kind: 'TEACHING' | 'PAUSE'; label?: string | undefined };

export type PrintItem = {
  day: number;
  start: string; // HH:MM
  end: string; // HH:MM
  /** Texte principal (matière pour une classe, classe pour un professeur). */
  title: string;
  /** Lignes secondaires (professeur, salle…). */
  lines: string[];
  /** Ce qui fixe la couleur (la matière, ou la classe). */
  colorKey: string;
};

export type Row = { start: string; end: string; kind: 'TEACHING' | 'PAUSE'; label: string | undefined };

export type Cell =
  | { type: 'items'; items: PrintItem[]; rowSpan: number }
  | { type: 'covered' }
  | { type: 'pause'; label: string }
  | { type: 'empty' }
  | { type: 'none' };

export type Layout = {
  days: number[];
  rows: Row[];
  /** cells[ligne][colonne du jour] */
  cells: Cell[][];
  /** Heures par clé de couleur (matière ou classe), dans l'ordre décroissant. */
  volume: { key: string; hours: number }[];
  totalHours: number;
};

/** Une feuille imprimable (une classe ou un enseignant). */
export type PrintSheet = {
  id: string;
  title: string;
  subtitle: string;
  right: string[];
  layout: Layout;
  colors: Record<string, { bg: string; ink: string }>;
  /** Ce que la couleur désigne, rappelé en bas de page. */
  colorMeaning: string;
};

const hm = (t: string) => t.slice(0, 5);

export function layoutTimetable(days: readonly number[], bands: readonly Band[], items: readonly PrintItem[]): Layout {
  // Lignes : chaque (début, fin) distinct de la grille, dans l'ordre de la journée.
  const rowKey = (b: { start: string; end: string }) => `${hm(b.start)}-${hm(b.end)}`;
  const rowMap = new Map<string, Row>();
  for (const b of bands) {
    const k = rowKey(b);
    const known = rowMap.get(k);
    if (!known) rowMap.set(k, { start: hm(b.start), end: hm(b.end), kind: b.kind, label: b.label });
    else if (known.kind === 'PAUSE' && b.kind === 'TEACHING') known.kind = 'TEACHING';
  }
  // Un cours placé hors de la grille (heure modifiée à la main) garde sa ligne.
  for (const it of items) {
    const inside = [...rowMap.values()].some((r) => r.start <= hm(it.start) && hm(it.start) < r.end);
    if (!inside) rowMap.set(rowKey(it), { start: hm(it.start), end: hm(it.end), kind: 'TEACHING', label: undefined });
  }
  const rows = [...rowMap.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const bandOf = new Map<string, Band>();
  for (const b of bands) bandOf.set(`${b.day}|${rowKey(b)}`, b);

  const cells: Cell[][] = rows.map((r) =>
    days.map((d): Cell => {
      const b = bandOf.get(`${d}|${r.start}-${r.end}`);
      if (b?.kind === 'PAUSE') return { type: 'pause', label: b.label ?? 'Pause' };
      return b ? { type: 'empty' } : { type: 'none' };
    }),
  );

  const volume = new Map<string, number>();
  let total = 0;
  const sorted = [...items].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  for (const it of sorted) {
    const col = days.indexOf(it.day);
    if (col < 0) continue;
    const first = rows.findIndex((r) => r.start <= hm(it.start) && hm(it.start) < r.end);
    if (first < 0) continue;
    const here = cells[first]![col]!;
    if (here.type === 'items') {
      here.items.push(it);
      continue;
    }
    if (here.type === 'covered') {
      // Chevauche un cours plus long déjà posé : on le montre avec lui.
      for (let i = first - 1; i >= 0; i--) {
        const up = cells[i]![col]!;
        if (up.type === 'items') {
          up.items.push(it);
          break;
        }
      }
      continue;
    }
    let span = 1;
    while (first + span < rows.length && rows[first + span]!.start < hm(it.end) && rows[first + span]!.kind === 'TEACHING') span++;
    cells[first]![col] = { type: 'items', items: [it], rowSpan: span };
    for (let i = 1; i < span; i++) cells[first + i]![col] = { type: 'covered' };
    const hours = rows.slice(first, first + span).filter((r) => r.kind === 'TEACHING').length;
    volume.set(it.colorKey, (volume.get(it.colorKey) ?? 0) + hours);
    total += hours;
  }

  return {
    days: [...days],
    rows,
    cells,
    volume: [...volume.entries()].map(([key, hours]) => ({ key, hours })).sort((a, b) => b.hours - a.hours || a.key.localeCompare(b.key, 'fr')),
    totalHours: total,
  };
}

/** Couleurs douces, lisibles en noir et blanc comme en couleur (texte foncé, fond pâle). */
export const PRINT_PALETTE: readonly { bg: string; ink: string }[] = [
  { bg: '#e0e7ff', ink: '#312e81' },
  { bg: '#fee2e2', ink: '#7f1d1d' },
  { bg: '#ffedd5', ink: '#7c2d12' },
  { bg: '#ecfccb', ink: '#365314' },
  { bg: '#dbeafe', ink: '#1e3a8a' },
  { bg: '#fce7f3', ink: '#831843' },
  { bg: '#ccfbf1', ink: '#134e4a' },
  { bg: '#cffafe', ink: '#164e63' },
  { bg: '#dcfce7', ink: '#14532d' },
  { bg: '#fef3c7', ink: '#78350f' },
  { bg: '#ede9fe', ink: '#4c1d95' },
  { bg: '#f3f4f6', ink: '#1f2937' },
];

/** Une couleur par clé, stable : les clés triées prennent les couleurs dans l'ordre. */
export function colorsFor(keys: Iterable<string>): Map<string, { bg: string; ink: string }> {
  const list = [...new Set(keys)].sort((a, b) => a.localeCompare(b, 'fr'));
  return new Map(list.map((k, i) => [k, PRINT_PALETTE[i % PRINT_PALETTE.length]!]));
}
