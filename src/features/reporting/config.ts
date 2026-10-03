/**
 * Ce qui est écrit sur un bulletin sans que personne ne le tape.
 *
 * Une appréciation, une mention, une décision ne sont pas des phrases saisies :
 * ce sont des PALIERS de moyenne. L'établissement fixe les seuils et les mots ;
 * l'application se contente de lire la moyenne et de descendre la liste.
 *
 * Module NEUTRE (pas de `server-only`) : les formulaires de réglage sont des
 * composants client et ont besoin des mêmes constantes.
 */

/** Teinte d'affichage d'un palier. Jamais une couleur en dur : le thème décide. */
export type TierTone = 'good' | 'neutral' | 'warn' | 'bad';

export const TIER_TONES: TierTone[] = ['good', 'neutral', 'warn', 'bad'];

export const TIER_TONE_LABELS: Record<TierTone, string> = {
  good: 'Favorable',
  neutral: 'Neutre',
  warn: 'Réserve',
  bad: 'Alerte',
};

/** « À partir de `min`, on écrit `label`. » */
export type Tier = {
  min: number;
  label: string;
  tone: TierTone;
};

/**
 * Une mention porte en plus un code : la base ne connaît que six distinctions
 * (migration 0023), mais leur libellé appartient à l'établissement.
 */
export const DISTINCTION_CODES = [
  'CONGRATULATIONS',
  'HONOUR_ROLL',
  'ENCOURAGEMENTS',
  'NONE',
  'WARNING_WORK',
  'WARNING_CONDUCT',
] as const;
export type DistinctionCode = (typeof DISTINCTION_CODES)[number];

export const DISTINCTION_HINTS: Record<DistinctionCode, string> = {
  CONGRATULATIONS: 'Félicitations',
  HONOUR_ROLL: "Tableau d'honneur",
  ENCOURAGEMENTS: 'Encouragements',
  NONE: 'Aucune distinction',
  WARNING_WORK: 'Avertissement travail',
  WARNING_CONDUCT: 'Avertissement conduite',
};

export type MentionTier = Tier & { code: DistinctionCode };

/** Les décisions de fin d'année. La base en connaît cinq ; les mots sont à l'école. */
export const DECISION_CODES = ['PROMOTED', 'CONDITIONAL', 'REPEAT', 'EXCLUDED', 'PENDING'] as const;
export type DecisionCode = (typeof DECISION_CODES)[number];

export const DECISION_HINTS: Record<DecisionCode, string> = {
  PROMOTED: "Passe dans la classe supérieure",
  CONDITIONAL: 'Passe sous condition',
  REPEAT: 'Redouble',
  EXCLUDED: "Quitte l'établissement",
  PENDING: 'Décision différée',
};

/**
 * Une décision proposée. `min` est facultatif : le conseil reste souverain,
 * l'application ne fait que pré-cocher la plus probable.
 *
 * Le libellé est normalement générique — « Admis(e) en classe supérieure ».
 * Une école qui préfère nommer la classe dispose de deux jetons : `{niveau}`
 * (la classe d'arrivée) et `{classe}` (la classe actuelle).
 */
export type DecisionOption = {
  code: DecisionCode;
  label: string;
  min: number | null;
};

// -----------------------------------------------------------------------------
// Les jeux par défaut — usage ivoirien, modifiables intégralement.
// -----------------------------------------------------------------------------

export const DEFAULT_SUBJECT_TIERS: Tier[] = [
  { min: 18, label: 'Excellent', tone: 'good' },
  { min: 16, label: 'Très bien', tone: 'good' },
  { min: 14, label: 'Bien', tone: 'good' },
  { min: 12, label: 'Assez bien', tone: 'neutral' },
  { min: 10, label: 'Passable', tone: 'neutral' },
  { min: 8, label: 'Médiocre', tone: 'warn' },
  { min: 0, label: 'Insuffisant', tone: 'bad' },
];

export const DEFAULT_TERM_MENTIONS: MentionTier[] = [
  { min: 16, label: 'Félicitations du conseil', tone: 'good', code: 'CONGRATULATIONS' },
  { min: 14, label: "Tableau d'honneur", tone: 'good', code: 'HONOUR_ROLL' },
  { min: 12, label: 'Encouragements du conseil', tone: 'good', code: 'ENCOURAGEMENTS' },
  { min: 10, label: 'Doit poursuivre ses efforts', tone: 'neutral', code: 'NONE' },
  { min: 8, label: 'Avertissement travail', tone: 'warn', code: 'WARNING_WORK' },
  { min: 0, label: 'Travail insuffisant', tone: 'bad', code: 'WARNING_WORK' },
];

export const DEFAULT_YEAR_MENTIONS: MentionTier[] = DEFAULT_TERM_MENTIONS;

export const DEFAULT_DECISIONS: DecisionOption[] = [
  { code: 'PROMOTED', label: 'Admis(e) en classe supérieure', min: 10 },
  { code: 'CONDITIONAL', label: 'Admis(e) en classe supérieure sous condition', min: 9 },
  { code: 'REPEAT', label: 'Redouble la classe', min: null },
  { code: 'EXCLUDED', label: "Exclu(e) de l'établissement", min: null },
  { code: 'PENDING', label: 'Décision différée', min: null },
];

// -----------------------------------------------------------------------------
// Les coefficients de période — comment se fabrique la moyenne annuelle.
// -----------------------------------------------------------------------------

export const ANNUAL_PRESETS = ['EQUAL', 'FIRST_HALF'] as const;
export type AnnualPreset = (typeof ANNUAL_PRESETS)[number] | 'CUSTOM';

export const ANNUAL_PRESET_LABELS: Record<'EQUAL' | 'FIRST_HALF', { title: string; hint: string }> = {
  EQUAL: {
    title: 'Toutes les périodes comptent pareil',
    hint: 'Moyenne annuelle = (1ᵉʳ + 2ᵉ + 3ᵉ) ÷ 3.',
  },
  FIRST_HALF: {
    title: 'La première compte moitié moins',
    hint: 'Coefficients 1, 2, 2 : moyenne annuelle = (1ᵉʳ + 2×2ᵉ + 2×3ᵉ) ÷ 5.',
  },
};

/**
 * Le poids d'une période est rangé par RANG (1, 2, 3…), pas par identifiant :
 * un établissement qui découpe en semestres pour le technique et en trimestres
 * pour le général partage alors le même réglage, et une nouvelle année scolaire
 * n'a rien à recopier.
 */
export type PeriodWeights = Record<string, number>;

export function presetWeights(preset: 'EQUAL' | 'FIRST_HALF', count: number): PeriodWeights {
  const out: PeriodWeights = {};
  for (let i = 1; i <= count; i++) out[String(i)] = preset === 'FIRST_HALF' && i > 1 ? 2 : 1;
  return out;
}

/** Le poids d'une période absente du réglage vaut 1 : jamais 0, jamais une erreur. */
export function weightOf(weights: PeriodWeights, sequence: number): number {
  const w = Number(weights[String(sequence)]);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

// -----------------------------------------------------------------------------
// Lecture
// -----------------------------------------------------------------------------

/**
 * Le palier d'une valeur. La liste est triée en descendant d'abord : un
 * établissement qui saisit ses seuils dans le désordre obtient quand même le
 * bon résultat.
 */
export function tierFor<T extends Tier>(tiers: T[], value: number | null): T | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sorted = sortTiers(tiers);
  return sorted.find((t) => value >= t.min) ?? null;
}

export function sortTiers<T extends Tier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => b.min - a.min);
}

/**
 * La décision que l'application pré-coche. Le conseil peut en choisir une autre :
 * c'est une proposition, pas un verdict.
 */
export function suggestDecision(options: DecisionOption[], average: number | null): DecisionOption | null {
  if (average === null) return null;
  const withMin = options.filter((o) => o.min !== null).sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
  return withMin.find((o) => average >= (o.min ?? 0)) ?? options.find((o) => o.code === 'REPEAT') ?? null;
}

/** Remplit `{niveau}` (classe d'arrivée) et `{classe}` (classe actuelle). */
export function fillDecisionLabel(label: string, current: string, next: string | null): string {
  return label.replaceAll('{classe}', current).replaceAll('{niveau}', next ?? 'supérieure');
}

// -----------------------------------------------------------------------------
// Contrôles de saisie
// -----------------------------------------------------------------------------

/**
 * Ce qui rendrait un jeu de paliers inutilisable. On refuse d'enregistrer
 * plutôt que d'imprimer un bulletin avec une case vide.
 */
export function tiersProblem(tiers: Tier[], scaleMax: number): string | null {
  if (tiers.length === 0) return 'Il faut au moins un palier.';
  const lowest = Math.min(...tiers.map((t) => t.min));
  if (lowest > 0) return 'Le palier le plus bas doit partir de 0, sinon les moyennes faibles n’auraient pas d’appréciation.';
  for (const t of tiers) {
    if (!t.label.trim()) return 'Chaque palier doit porter un mot.';
    if (!Number.isFinite(t.min) || t.min < 0 || t.min > scaleMax) {
      return `Les seuils doivent être compris entre 0 et ${scaleMax}.`;
    }
  }
  const seen = new Set<number>();
  for (const t of tiers) {
    if (seen.has(t.min)) return `Deux paliers partent de ${t.min} : l’application ne saurait lequel écrire.`;
    seen.add(t.min);
  }
  return null;
}
