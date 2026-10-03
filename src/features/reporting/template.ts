/**
 * Le modèle de bulletin : ce qui figure sur la page, dans quel ordre.
 *
 * Pas d'éditeur libre à la PowerPoint — on poserait des boîtes qui débordent
 * dès qu'une classe a quatorze matières. Ici, l'établissement COCHE, RÉORDONNE
 * et RÉÉCRIT les textes ; la mise en page reste garantie, et la page tient sur
 * une feuille A4.
 *
 * Module NEUTRE (pas de `server-only`) : l'éditeur est un composant client et a
 * besoin des mêmes constantes.
 */

// -----------------------------------------------------------------------------
// Les blocs de la page
// -----------------------------------------------------------------------------

export const BLOCK_IDS = [
  'header',
  'identity',
  'average',
  'table',
  'totals',
  'scale',
  'stats',
  'previous',
  'mention',
  'decision',
  'council',
  'signatures',
  'footer',
] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

export const BLOCK_LABELS: Record<BlockId, { title: string; hint: string; locked?: boolean }> = {
  header: { title: 'En-tête officiel', hint: 'République, ministère, nom et coordonnées de l’établissement, logo.' },
  identity: { title: 'Identité de l’élève', hint: 'Nom, matricule, naissance, classe, statut, professeur principal.' },
  average: { title: 'Moyenne en évidence', hint: 'Le pavé de tête. Sur le dernier bulletin, la moyenne annuelle s’y ajoute, plus grande.' },
  table: { title: 'Tableau des matières', hint: 'Le cœur du bulletin. Ne peut pas être retiré.', locked: true },
  totals: { title: 'Ligne des totaux', hint: 'Total des coefficients et des points.' },
  scale: { title: 'Échelle des appréciations', hint: 'Le rappel des paliers, en petit sous le tableau.' },
  stats: { title: 'Repères de la classe', hint: 'Moyenne de la classe, moyenne la plus haute, absences et retards.' },
  previous: { title: 'Rappel des périodes', hint: 'Les moyennes déjà obtenues cette année. Vide sur le premier bulletin.' },
  mention: { title: 'Mention', hint: 'Le palier calculé, et l’additif que le conseil ajoute à côté.' },
  decision: { title: 'Décision du conseil', hint: 'Passage en classe supérieure. Uniquement sur le dernier bulletin de l’année.' },
  council: { title: 'Appréciation du conseil', hint: 'Le paragraphe, ouvert par la mention calculée.' },
  signatures: { title: 'Cases de signature', hint: 'Professeur principal, chef d’établissement, parent — à vous de les nommer.' },
  footer: { title: 'Pied de page', hint: 'Lieu, date, mention légale.' },
};

/** L'ordre par défaut de la page, celui de la maquette validée. */
export const DEFAULT_BLOCKS: BlockId[] = [...BLOCK_IDS];

// -----------------------------------------------------------------------------
// Les colonnes du tableau
// -----------------------------------------------------------------------------

export const COLUMN_IDS = [
  'subject',
  'coefficient',
  'average',
  'points',
  'rank',
  'appreciation',
  'teacher',
  'signature',
  'classAverage',
  'min',
  'max',
] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];

export const COLUMN_LABELS: Record<ColumnId, { title: string; hint?: string; locked?: boolean }> = {
  subject: { title: 'Matière', locked: true },
  coefficient: { title: 'Coef' },
  average: { title: 'Moy/20', locked: true },
  points: { title: 'Points' },
  rank: { title: 'Rang', hint: 'Le rang de l’élève dans la classe, matière par matière.' },
  appreciation: { title: 'Appréciation', hint: 'Le mot du palier : Bien, Passable… jamais une phrase.' },
  teacher: { title: 'Professeur', hint: 'Le nom figé à la génération.' },
  signature: { title: 'Signature', hint: 'Une case vide, que l’enseignant signe à la main.' },
  classAverage: { title: 'Moy. classe', hint: 'La moyenne de la classe dans cette matière.' },
  min: { title: 'Min', hint: 'La plus basse moyenne de la classe.' },
  max: { title: 'Max', hint: 'La plus haute moyenne de la classe.' },
};

/** Les huit colonnes retenues. Les trois autres restent disponibles. */
export const DEFAULT_COLUMNS: ColumnId[] = [
  'subject',
  'coefficient',
  'average',
  'points',
  'rank',
  'appreciation',
  'teacher',
  'signature',
];

// -----------------------------------------------------------------------------
// Le modèle
// -----------------------------------------------------------------------------

export type Density = 'NORMAL' | 'COMPACT';

export const DENSITY_LABELS: Record<Density, { title: string; hint: string }> = {
  NORMAL: { title: 'Aéré', hint: 'Lignes hautes. Convient jusqu’à une douzaine de matières.' },
  COMPACT: { title: 'Serré', hint: 'Lignes basses, pour les niveaux les plus chargés.' },
};

export type BulletinTemplate = {
  /** Les lignes de l'en-tête officiel, à réécrire librement (un autre pays, un autre ministère). */
  headerLines: string[];
  title: string;
  showLogo: boolean;
  /** Les blocs, dans l'ordre d'affichage. Un bloc absent de la liste est masqué. */
  blocks: BlockId[];
  columns: ColumnId[];
  signatures: string[];
  footerLeft: string;
  footerRight: string;
  /** Couleur d'accent ; vide = celle de l'établissement. */
  accent: string | null;
  density: Density;
};

export const DEFAULT_TEMPLATE: BulletinTemplate = {
  headerLines: [
    'RÉPUBLIQUE DE CÔTE D’IVOIRE',
    'Union — Discipline — Travail',
    'Ministère de l’Éducation Nationale',
  ],
  title: 'BULLETIN DE NOTES',
  showLogo: true,
  blocks: DEFAULT_BLOCKS,
  columns: DEFAULT_COLUMNS,
  signatures: ['Le Professeur Principal', 'Le Chef d’Établissement', 'Visa du parent ou tuteur'],
  footerLeft: '{ville}, le {date} — bulletin remis en main propre, toute rature l’annule.',
  footerRight: 'Édité par Gestion Scolaire',
  accent: null,
  density: 'NORMAL',
};

/** Les jetons remplacés à l'impression. */
export const FOOTER_TOKENS: Record<string, string> = {
  '{ville}': 'la ville de l’établissement',
  '{date}': 'la date d’édition',
  '{etablissement}': 'le nom de l’établissement',
  '{annee}': 'l’année scolaire',
};

export function fillTokens(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [jeton, valeur] of Object.entries(values)) out = out.replaceAll(jeton, valeur);
  return out;
}

// -----------------------------------------------------------------------------
// Ce qu'on refuse d'enregistrer
// -----------------------------------------------------------------------------

/** Deux blocs et deux colonnes ne se retirent pas : sans eux, ce n'est plus un bulletin. */
export function templateProblem(t: BulletinTemplate): string | null {
  if (!t.title.trim()) return 'Le bulletin doit porter un titre.';
  if (!t.blocks.includes('table')) return 'Le tableau des matières ne peut pas être retiré.';
  for (const c of ['subject', 'average'] as ColumnId[]) {
    if (!t.columns.includes(c)) return `La colonne « ${COLUMN_LABELS[c].title} » ne peut pas être retirée.`;
  }
  if (t.columns.length > 9) {
    return 'Au-delà de neuf colonnes, le tableau ne tient plus sur une page A4. Retirez-en une.';
  }
  if (t.signatures.length > 4) return 'Quatre cases de signature au maximum.';
  return null;
}

/**
 * La hauteur de ligne du tableau, en pixels.
 *
 * Elle se resserre toute seule quand les matières s'accumulent : une école qui
 * en compte dix-huit doit tenir sur une page comme celle qui en compte dix.
 * En dessous de 22 px, ce ne serait plus lisible — on s'arrête là.
 */
export function rowHeight(subjectCount: number, density: Density): number {
  const base = density === 'COMPACT' ? 27 : 31;
  if (subjectCount <= 13) return base;
  const reduit = base - (subjectCount - 13) * 1.5;
  return Math.max(22, Math.round(reduit));
}

/** Au-delà, aucune mise en page ne tient sur une feuille : il faut le dire. */
export const MAX_SUBJECTS_ONE_PAGE = 18;
