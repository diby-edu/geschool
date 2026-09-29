/**
 * Catalogue des règles d'emploi du temps.
 *
 * Une règle n'est JAMAIS une phrase libre : un solveur ne lit pas le français.
 * Chaque règle est un code, une portée, une sévérité et des paramètres — c'est
 * exactement ce que stocke `schedule_constraints` (colonnes `constraint_code`,
 * `scope_type`, `scope_id`, `severity`, `weight`, `parameters`).
 *
 * Trois principes, parce que l'application sert des écoles que nous ne
 * connaissons pas :
 *
 *  1. L'ÉCOLE choisit la sévérité. « Pas cours le mercredi après-midi » est
 *     absolu dans une école confessionnelle et une simple préférence ailleurs.
 *     Le code ne tranche pas à sa place.
 *
 *  2. L'ÉCOLE choisit la portée. La même règle vaut pour l'établissement
 *     entier, un niveau, une classe, une matière ou un enseignant. Une règle
 *     écrite pour un seul cas ne sert qu'à ce cas.
 *
 *  3. RIEN n'est proposé qui ne soit appliqué. Une règle absente vaut mieux
 *     qu'une case à cocher sans effet — c'est la leçon de l'audit des droits.
 *     Ajouter un code ici oblige à l'implémenter dans le générateur.
 *
 * La première règle, « moment interdit », est volontairement fourre-tout :
 * c'est elle qui attrape ce que nous n'avons pas prévu — l'heure de prière, le
 * jour de marché, le professeur partagé avec un autre établissement.
 *
 * Ce fichier ne touche pas la base : il est partagé par les écrans (composants
 * client) et par le générateur.
 */

export const CONSTRAINT_SCOPES = ['SCHOOL', 'LEVEL', 'CLASS', 'SUBJECT', 'TEACHER'] as const;
export type ConstraintScope = (typeof CONSTRAINT_SCOPES)[number];

export const SCOPE_LABELS: Record<ConstraintScope, string> = {
  SCHOOL: 'Tout l’établissement',
  LEVEL: 'Un niveau',
  CLASS: 'Une classe',
  SUBJECT: 'Une matière',
  TEACHER: 'Un enseignant',
};

export type Severity = 'HARD' | 'SOFT';

export const SEVERITY_LABELS: Record<Severity, string> = {
  HARD: 'Obligatoire',
  SOFT: 'Préférence',
};

export const FAMILIES = ['TIME', 'LOAD', 'PLACEMENT', 'GROUPING'] as const;
export type ConstraintFamily = (typeof FAMILIES)[number];

export const FAMILY_LABELS: Record<ConstraintFamily, string> = {
  TIME: 'Moments interdits',
  LOAD: 'Charge',
  PLACEMENT: 'Placement dans la journée',
  GROUPING: 'Regroupement des séances',
};

/** Un paramètre de règle, décrit assez précisément pour dessiner son champ. */
export type ParamSpec =
  /** Jours de la semaine, 1 = lundi. Plusieurs possibles. */
  | { key: string; kind: 'DAYS'; label: string; hint?: string; required: boolean }
  /** Une plage horaire dans la journée. Absente = la journée entière. */
  | { key: string; kind: 'TIME_RANGE'; label: string; hint?: string; required: boolean }
  /** Un nombre de séances. */
  | { key: string; kind: 'SESSIONS'; label: string; hint?: string; required: boolean; min: number; max: number }
  /** Matin ou après-midi. */
  | { key: string; kind: 'DAY_PART'; label: string; hint?: string; required: boolean }
  /** Texte libre : jamais interprété, seulement affiché. */
  | { key: string; kind: 'TEXT'; label: string; hint?: string; required: boolean; max: number };

export type ConstraintDef = {
  code: string;
  family: ConstraintFamily;
  label: string;
  /** Ce que la règle fait, en une phrase. */
  description: string;
  /** Un cas réel, pour que le directeur se reconnaisse. */
  example: string;
  /** Portées possibles. L'école en choisit une. */
  scopes: ConstraintScope[];
  /** Sévérités possibles. Certaines règles n'ont de sens qu'en préférence. */
  severities: Severity[];
  defaultSeverity: Severity;
  params: ParamSpec[];
};

const days = (required = true): ParamSpec => ({
  key: 'days',
  kind: 'DAYS',
  label: 'Jours concernés',
  hint: 'Aucun jour coché = tous les jours',
  required,
});

const timeRange: ParamSpec = {
  key: 'range',
  kind: 'TIME_RANGE',
  label: 'Plage horaire',
  hint: 'Laissez vide pour la journée entière',
  required: false,
};

const reason: ParamSpec = {
  key: 'reason',
  kind: 'TEXT',
  label: 'Motif',
  hint: 'Affiché dans les diagnostics, jamais interprété',
  required: false,
  max: 120,
};

/**
 * Le catalogue. Sept règles : assez peu pour être toutes implémentées, assez
 * générales pour qu'une école y trouve son cas.
 *
 * Absentes volontairement, parce qu'elles existent déjà ailleurs :
 *  - le service hebdomadaire d'un enseignant (sa fiche, et les défauts par contrat) ;
 *  - le type de salle exigé ou préféré (les exigences pédagogiques) ;
 *  - les fermetures et indisponibilités de salle (le module Salles).
 */
export const CONSTRAINT_CATALOG: ConstraintDef[] = [
  {
    code: 'TIME_FORBIDDEN',
    family: 'TIME',
    label: 'Moment interdit',
    description: 'Aucun cours ne peut être placé à ces jours et heures.',
    example: 'Jamais d’EPS le mercredi · Pas cours le vendredi après-midi · M. Koffi absent le lundi',
    scopes: ['SCHOOL', 'LEVEL', 'CLASS', 'SUBJECT', 'TEACHER'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'HARD',
    params: [days(), timeRange, reason],
  },
  {
    code: 'MAX_PER_DAY',
    family: 'LOAD',
    label: 'Maximum par jour',
    description: 'Pas plus de N séances dans une même journée.',
    example: 'Pas plus de 6 séances par jour pour une 6ème · Pas plus de 2 séances de maths le même jour',
    scopes: ['SCHOOL', 'LEVEL', 'CLASS', 'SUBJECT', 'TEACHER'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'HARD',
    params: [
      { key: 'max', kind: 'SESSIONS', label: 'Maximum de séances', required: true, min: 1, max: 12 },
      days(false),
    ],
  },
  {
    code: 'MAX_CONSECUTIVE',
    family: 'LOAD',
    label: 'Maximum d’affilée',
    description: 'Pas plus de N séances qui se suivent sans interruption.',
    example: 'Pas plus de 2 heures d’affilée pour M. Koffi · Jamais 3 heures de maths à la suite',
    scopes: ['SCHOOL', 'LEVEL', 'CLASS', 'SUBJECT', 'TEACHER'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'SOFT',
    params: [{ key: 'max', kind: 'SESSIONS', label: 'Séances consécutives', required: true, min: 1, max: 8 }],
  },
  {
    code: 'PREFERRED_DAY_PART',
    family: 'PLACEMENT',
    label: 'Plutôt le matin ou l’après-midi',
    description: 'Le générateur essaie de placer ces cours dans la demi-journée choisie.',
    example: 'Les mathématiques plutôt le matin · L’EPS plutôt l’après-midi',
    scopes: ['LEVEL', 'CLASS', 'SUBJECT', 'TEACHER'],
    // Une préférence seulement : l'imposer rendrait presque tout infaisable.
    severities: ['SOFT'],
    defaultSeverity: 'SOFT',
    params: [{ key: 'part', kind: 'DAY_PART', label: 'Demi-journée souhaitée', required: true }],
  },
  {
    code: 'NO_GAPS',
    family: 'PLACEMENT',
    label: 'Éviter les trous dans la journée',
    description:
      'Le générateur resserre les cours : moins d’heures creuses entre le premier et le dernier cours du jour.',
    example: 'Pas de trou pour les 6èmes · Regrouper les heures de M. Koffi',
    scopes: ['SCHOOL', 'LEVEL', 'CLASS', 'TEACHER'],
    // Impossible à imposer : sur une semaine chargée, un trou est parfois la
    // seule issue, et l'exiger rendrait la génération infaisable sans recours.
    severities: ['SOFT'],
    defaultSeverity: 'SOFT',
    params: [],
  },
  {
    code: 'NOT_LAST_SLOT',
    family: 'PLACEMENT',
    label: 'Jamais en dernière heure',
    description: 'Ces cours ne tombent pas sur le dernier créneau de la journée.',
    example: 'Pas de mathématiques en dernière heure · Pas de composition en fin de journée',
    scopes: ['LEVEL', 'CLASS', 'SUBJECT'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'SOFT',
    params: [],
  },
  {
    code: 'SPREAD_DAYS',
    family: 'GROUPING',
    label: 'Répartir sur des jours différents',
    description: 'Les séances d’une même matière ne se retrouvent pas le même jour.',
    example: 'Les 5 séances de français sur 5 jours différents',
    scopes: ['LEVEL', 'CLASS', 'SUBJECT'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'SOFT',
    params: [],
  },
  {
    code: 'BLOCK_SESSIONS',
    family: 'GROUPING',
    label: 'Grouper les séances',
    description: 'Les séances se placent par blocs qui se suivent, au lieu d’être dispersées.',
    example: 'Les TP de SVT par blocs de 2 séances · L’atelier mécanique par blocs de 4',
    scopes: ['LEVEL', 'CLASS', 'SUBJECT'],
    severities: ['HARD', 'SOFT'],
    defaultSeverity: 'SOFT',
    params: [{ key: 'size', kind: 'SESSIONS', label: 'Taille du bloc', required: true, min: 2, max: 6 }],
  },
];

export const CONSTRAINT_BY_CODE = new Map(CONSTRAINT_CATALOG.map((c) => [c.code, c]));

/** Les règles d'une famille, dans l'ordre du catalogue. */
export function familyRules(family: ConstraintFamily): ConstraintDef[] {
  return CONSTRAINT_CATALOG.filter((c) => c.family === family);
}

/** Les règles applicables à une portée donnée — ce que propose l'écran de saisie. */
export function rulesForScope(scope: ConstraintScope): ConstraintDef[] {
  return CONSTRAINT_CATALOG.filter((c) => c.scopes.includes(scope));
}

export type ParamValues = Record<string, unknown>;

export type ParamProblem = { key: string; message: string };

/**
 * Contrôle les paramètres d'une règle avant enregistrement.
 *
 * Rendre une règle invalide silencieusement serait pire que la refuser : elle
 * s'afficherait dans la liste sans jamais agir, et personne ne saurait pourquoi
 * l'emploi du temps l'ignore.
 */
export function validateParams(def: ConstraintDef, values: ParamValues): ParamProblem[] {
  const problems: ParamProblem[] = [];
  for (const spec of def.params) {
    const value = values[spec.key];
    const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

    if (missing) {
      if (spec.required) problems.push({ key: spec.key, message: `${spec.label} : à renseigner.` });
      continue;
    }

    if (spec.kind === 'DAYS') {
      const list = Array.isArray(value) ? value : [];
      if (!list.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) {
        problems.push({ key: spec.key, message: `${spec.label} : jour invalide.` });
      }
    }

    if (spec.kind === 'SESSIONS') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
        problems.push({ key: spec.key, message: `${spec.label} : entre ${spec.min} et ${spec.max}.` });
      }
    }

    if (spec.kind === 'DAY_PART' && value !== 'MORNING' && value !== 'AFTERNOON') {
      problems.push({ key: spec.key, message: `${spec.label} : matin ou après-midi.` });
    }

    if (spec.kind === 'TIME_RANGE') {
      const r = value as { from?: string; to?: string };
      const ok = (t: unknown) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
      if (!ok(r?.from) || !ok(r?.to)) {
        problems.push({ key: spec.key, message: `${spec.label} : heures au format 08:00.` });
      } else if (r.to! <= r.from!) {
        problems.push({ key: spec.key, message: `${spec.label} : l’heure de fin doit suivre celle de début.` });
      }
    }

    if (spec.kind === 'TEXT' && String(value).length > spec.max) {
      problems.push({ key: spec.key, message: `${spec.label} : ${spec.max} caractères au maximum.` });
    }
  }
  return problems;
}

/**
 * La règle telle qu'on la lit dans la liste : « Jamais le mercredi, de 12:00 à
 * 18:00 ». Une règle qu'on ne sait pas relire est une règle qu'on n'ose pas
 * modifier.
 */
export function describeRule(def: ConstraintDef, values: ParamValues): string {
  const parts: string[] = [];
  const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  for (const spec of def.params) {
    const value = values[spec.key];
    if (value === undefined || value === null || value === '') continue;

    if (spec.kind === 'DAYS' && Array.isArray(value) && value.length > 0) {
      parts.push(value.map((d) => DAY_NAMES[(d as number) - 1] ?? '?').join(', '));
    }
    if (spec.kind === 'TIME_RANGE') {
      const r = value as { from?: string; to?: string };
      if (r?.from && r?.to) parts.push(`de ${r.from} à ${r.to}`);
    }
    if (spec.kind === 'SESSIONS') parts.push(`${value} séance${Number(value) > 1 ? 's' : ''}`);
    if (spec.kind === 'DAY_PART') parts.push(value === 'MORNING' ? 'le matin' : 'l’après-midi');
  }

  return parts.length > 0 ? `${def.label} — ${parts.join(' · ')}` : def.label;
}
