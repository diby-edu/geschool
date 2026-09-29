/**
 * Application des règles au moment de construire le problème.
 *
 * Une règle DURE se traduit ici par un retrait de créneaux candidats : le
 * solveur ne voit jamais les moments interdits, il n'a donc aucune chance de
 * les choisir. Rien à ajouter au modèle mathématique, et la garantie est totale.
 *
 * Volontairement isolé de la base et du solveur pour être testable tel quel :
 * c'est le code qui décide si un cours a le droit d'exister à un moment donné,
 * et une erreur ici produirait un emploi du temps faux sans rien signaler.
 */

import type { ConstraintScope, ParamValues } from './catalog';

/** Une règle active, telle que le générateur la reçoit. */
export type ActiveRule = {
  code: string;
  scopeType: ConstraintScope;
  scopeId: string | null;
  params: ParamValues;
  /** Pour nommer la règle dans un diagnostic. */
  summary: string;
};

/** À quoi se rattache un cours : c'est ce qui décide si une règle le concerne. */
export type CourseScope = {
  subjectId: string;
  classIds: string[];
  levelIds: string[];
  teacherIds: string[];
};

/** Une fenêtre de temps dans la semaine : jour (1 = lundi) et minutes depuis minuit. */
export type Window = { day: number; startMin: number; endMin: number };

/**
 * La règle vise-t-elle ce cours ?
 *
 * Une règle d'établissement vise tout le monde. Les autres ne visent que leur
 * cible : la matière, la classe, le niveau ou l'enseignant désigné.
 */
export function ruleAppliesTo(rule: ActiveRule, course: CourseScope): boolean {
  switch (rule.scopeType) {
    case 'SCHOOL':
      return true;
    case 'SUBJECT':
      return rule.scopeId === course.subjectId;
    case 'CLASS':
      return rule.scopeId !== null && course.classIds.includes(rule.scopeId);
    case 'LEVEL':
      return rule.scopeId !== null && course.levelIds.includes(rule.scopeId);
    case 'TEACHER':
      return rule.scopeId !== null && course.teacherIds.includes(rule.scopeId);
    default:
      return false;
  }
}

const toMinutes = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/**
 * La règle « moment interdit » couvre-t-elle cette fenêtre ?
 *
 * Aucun jour coché veut dire TOUS les jours — c'est ce qu'annonce l'aide du
 * formulaire, et c'est ce qui rend la règle utilisable pour « jamais après 16h ».
 * Aucune plage horaire veut dire la journée entière.
 *
 * Le chevauchement suffit : un cours qui déborde d'une minute sur un moment
 * interdit est interdit. Un cours de 11h à 13h tombe sous « interdit à partir
 * de midi ».
 */
export function forbidsWindow(rule: ActiveRule, window: Window): boolean {
  if (rule.code !== 'TIME_FORBIDDEN') return false;

  const days = Array.isArray(rule.params.days) ? (rule.params.days as number[]) : [];
  if (days.length > 0 && !days.includes(window.day)) return false;

  const range = rule.params.range as { from?: unknown; to?: unknown } | undefined;
  const from = toMinutes(range?.from);
  const to = toMinutes(range?.to);
  if (from === null || to === null || to <= from) return true; // journée entière

  return window.startMin < to && from < window.endMin;
}

/**
 * Les règles dures qui empêchent ce cours de tenir sur cette fenêtre.
 *
 * On renvoie la liste, pas un booléen : quand un cours ne trouve plus aucun
 * créneau, le diagnostic doit nommer la règle en cause. « Aucun créneau
 * compatible » sans explication fait perdre des soirées.
 */
export function blockingRules(rules: ActiveRule[], course: CourseScope, window: Window): ActiveRule[] {
  return rules.filter((rule) => ruleAppliesTo(rule, course) && forbidsWindow(rule, window));
}

/** Raccourci pour le filtrage des créneaux candidats. */
export function isWindowAllowed(rules: ActiveRule[], course: CourseScope, window: Window): boolean {
  return !rules.some((rule) => ruleAppliesTo(rule, course) && forbidsWindow(rule, window));
}

/**
 * Les tâches visées par une règle de charge.
 *
 * « Pas plus de 2 heures d'affilée pour M. Koffi » ne dit rien sur un cours
 * isolé : elle porte sur l'ensemble de ses cours. On rassemble donc, pour
 * chaque règle, les index des tâches concernées — c'est ce que le solveur sait
 * traiter.
 *
 * Une règle par CLASSE ou par NIVEAU se scinde en autant de plafonds qu'il y a
 * de cibles : sinon « pas plus de 6 séances par jour en 6ème » limiterait le
 * total des six sixièmes réunies, et non chacune d'elles.
 */
export type CourseTask = { taskIndex: number; scope: CourseScope };

export type SolverLoadLimit = {
  taskIndexes: number[];
  maxPerDay: number | null;
  maxConsecutive: number | null;
  /** `null` = plafond dur. Un entier = plafond souple, dépassable en le payant. */
  weight: number | null;
  label: string;
};

export function loadLimits(rules: ActiveRule[], tasks: CourseTask[]): SolverLoadLimit[] {
  const out: SolverLoadLimit[] = [];

  for (const rule of rules) {
    if (rule.code !== 'MAX_PER_DAY' && rule.code !== 'MAX_CONSECUTIVE') continue;
    const max = Number(rule.params.max);
    if (!Number.isInteger(max) || max < 0) continue;

    const concerned = tasks.filter((t) => ruleAppliesTo(rule, t.scope));
    if (concerned.length === 0) continue;

    // Regrouper par cible réelle : une règle de niveau vaut CLASSE PAR CLASSE.
    const groups = new Map<string, number[]>();
    for (const t of concerned) {
      const keys =
        rule.scopeType === 'LEVEL' || rule.scopeType === 'SCHOOL'
          ? t.scope.classIds.length > 0
            ? t.scope.classIds
            : ['—']
          : ['tout'];
      for (const key of keys) {
        const list = groups.get(key) ?? [];
        list.push(t.taskIndex);
        groups.set(key, list);
      }
    }

    for (const taskIndexes of groups.values()) {
      out.push({
        taskIndexes: [...new Set(taskIndexes)].sort((a, b) => a - b),
        maxPerDay: rule.code === 'MAX_PER_DAY' ? max : null,
        maxConsecutive: rule.code === 'MAX_CONSECUTIVE' ? Math.max(1, max) : null,
        weight: null,
        label: rule.summary,
      });
    }
  }

  return out;
}

/* --------------------------------------------------------------------------
   Préférences
   --------------------------------------------------------------------------
   Une règle SOUPLE ne retire pas de créneau : elle en rend certains coûteux.
   Le solveur arbitre alors entre plusieurs solutions valides, au lieu de
   s'arrêter à la première venue.
   -------------------------------------------------------------------------- */

/** Un créneau de la grille, avec sa place dans la journée. */
export type SlotInfo = { index: number; day: number; rank: number; lastOfDay: boolean; startMin: number };

export type SolverSlotPenalty = { taskIndexes: number[]; slots: number[]; weight: number; label: string };
export type SolverGapPenalty = { taskIndexes: number[]; weight: number; label: string };

/** Midi : frontière entre matin et après-midi, en minutes depuis minuit. */
const NOON = 12 * 60;

/**
 * Les créneaux déconseillés, règle par règle.
 *
 * `PREFERRED_DAY_PART` et `NOT_LAST_SLOT` se ramènent toutes deux à « ces
 * créneaux coûtent » : une seule primitive côté solveur pour deux règles.
 */
export function slotPenalties(
  rules: ActiveRule[],
  tasks: CourseTask[],
  slots: SlotInfo[],
  weightOf: (rule: ActiveRule) => number,
): SolverSlotPenalty[] {
  const out: SolverSlotPenalty[] = [];

  for (const rule of rules) {
    let discouraged: number[] = [];

    if (rule.code === 'PREFERRED_DAY_PART') {
      const part = rule.params.part;
      if (part !== 'MORNING' && part !== 'AFTERNOON') continue;
      // On pénalise l'AUTRE demi-journée : préférer le matin, c'est payer l'après-midi.
      discouraged = slots.filter((s) => (part === 'MORNING' ? s.startMin >= NOON : s.startMin < NOON)).map((s) => s.index);
    } else if (rule.code === 'NOT_LAST_SLOT') {
      discouraged = slots.filter((s) => s.lastOfDay).map((s) => s.index);
    } else {
      continue;
    }

    if (discouraged.length === 0) continue;
    const taskIndexes = tasks.filter((t) => ruleAppliesTo(rule, t.scope)).map((t) => t.taskIndex);
    if (taskIndexes.length === 0) continue;

    out.push({ taskIndexes, slots: discouraged, weight: weightOf(rule), label: rule.summary });
  }

  return out;
}

/**
 * Les trous à éviter, ressource par ressource.
 *
 * Un trou n'a de sens que pour UNE classe ou UN enseignant : mélanger les
 * séances de deux classes dans le même calcul produirait un chiffre qui ne veut
 * rien dire. On scinde donc systématiquement par cible réelle.
 */
export function gapPenalties(
  rules: ActiveRule[],
  tasks: CourseTask[],
  weightOf: (rule: ActiveRule) => number,
): SolverGapPenalty[] {
  const out: SolverGapPenalty[] = [];

  for (const rule of rules) {
    if (rule.code !== 'NO_GAPS') continue;
    const concerned = tasks.filter((t) => ruleAppliesTo(rule, t.scope));
    if (concerned.length === 0) continue;

    const groups = new Map<string, number[]>();
    for (const t of concerned) {
      // Une règle d'enseignant se groupe par enseignant ; tout le reste par classe.
      const keys = rule.scopeType === 'TEACHER' ? t.scope.teacherIds : t.scope.classIds;
      for (const key of keys.length > 0 ? keys : ['—']) {
        const list = groups.get(key) ?? [];
        list.push(t.taskIndex);
        groups.set(key, list);
      }
    }

    for (const taskIndexes of groups.values()) {
      if (taskIndexes.length < 2) continue; // un seul cours ne laisse pas de trou
      out.push({
        taskIndexes: [...new Set(taskIndexes)].sort((a, b) => a - b),
        weight: weightOf(rule),
        label: rule.summary,
      });
    }
  }

  return out;
}

/**
 * « Répartir sur des jours différents » est exactement « au plus une séance par
 * jour » : la règle se traduit dans le plafond existant plutôt que d'ajouter
 * un concept au solveur.
 */
export function spreadLimits(
  rules: ActiveRule[],
  tasks: CourseTask[],
  weightOf: (rule: ActiveRule) => number,
): SolverLoadLimit[] {
  const out: SolverLoadLimit[] = [];

  for (const rule of rules) {
    if (rule.code !== 'SPREAD_DAYS') continue;
    const concerned = tasks.filter((t) => ruleAppliesTo(rule, t.scope));
    if (concerned.length === 0) continue;

    // Par classe : « les 5 français sur 5 jours » vaut classe par classe.
    const groups = new Map<string, number[]>();
    for (const t of concerned) {
      for (const key of t.scope.classIds.length > 0 ? t.scope.classIds : ['—']) {
        const list = groups.get(key) ?? [];
        list.push(t.taskIndex);
        groups.set(key, list);
      }
    }

    for (const taskIndexes of groups.values()) {
      out.push({
        taskIndexes: [...new Set(taskIndexes)].sort((a, b) => a - b),
        maxPerDay: 1,
        maxConsecutive: null,
        weight: weightOf(rule),
        label: rule.summary,
      });
    }
  }

  return out;
}
