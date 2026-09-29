import { describe, expect, it } from 'vitest';
import {
  blockingRules,
  forbidsWindow,
  isWindowAllowed,
  loadLimits,
  ruleAppliesTo,
  type ActiveRule,
  type CourseScope,
  type CourseTask,
  type SlotInfo,
  gapPenalties,
  slotPenalties,
  spreadLimits,
} from './apply';

const rule = (over: Partial<ActiveRule> = {}): ActiveRule => ({
  code: 'TIME_FORBIDDEN',
  scopeType: 'SCHOOL',
  scopeId: null,
  params: {},
  summary: 'Moment interdit',
  ...over,
});

const course: CourseScope = {
  subjectId: 'eps',
  classIds: ['6e1'],
  levelIds: ['6e'],
  teacherIds: ['koffi'],
};

// Mercredi 08:00–09:00, puis mercredi 14:00–15:00.
const mercrediMatin = { day: 3, startMin: 480, endMin: 540 };
const mercrediApresMidi = { day: 3, startMin: 840, endMin: 900 };
const lundiMatin = { day: 1, startMin: 480, endMin: 540 };

describe('ruleAppliesTo', () => {
  it('une règle d’établissement vise tout le monde', () => {
    expect(ruleAppliesTo(rule(), course)).toBe(true);
  });

  it('une règle de matière ne vise que sa matière', () => {
    expect(ruleAppliesTo(rule({ scopeType: 'SUBJECT', scopeId: 'eps' }), course)).toBe(true);
    expect(ruleAppliesTo(rule({ scopeType: 'SUBJECT', scopeId: 'maths' }), course)).toBe(false);
  });

  it('une règle de classe vise le cours qui touche cette classe', () => {
    expect(ruleAppliesTo(rule({ scopeType: 'CLASS', scopeId: '6e1' }), course)).toBe(true);
    expect(ruleAppliesTo(rule({ scopeType: 'CLASS', scopeId: '5e2' }), course)).toBe(false);
  });

  it('une règle de niveau vise le cours par le niveau de ses classes', () => {
    expect(ruleAppliesTo(rule({ scopeType: 'LEVEL', scopeId: '6e' }), course)).toBe(true);
    expect(ruleAppliesTo(rule({ scopeType: 'LEVEL', scopeId: '3e' }), course)).toBe(false);
  });

  it('une règle d’enseignant vise chacun de ses cours', () => {
    expect(ruleAppliesTo(rule({ scopeType: 'TEACHER', scopeId: 'koffi' }), course)).toBe(true);
    expect(ruleAppliesTo(rule({ scopeType: 'TEACHER', scopeId: 'kone' }), course)).toBe(false);
  });

  it('une cible manquante ne vise personne, plutôt que tout le monde', () => {
    expect(ruleAppliesTo(rule({ scopeType: 'TEACHER', scopeId: null }), course)).toBe(false);
  });
});

describe('forbidsWindow', () => {
  it('interdit le jour entier quand aucune plage n’est donnée', () => {
    const r = rule({ params: { days: [3] } });
    expect(forbidsWindow(r, mercrediMatin)).toBe(true);
    expect(forbidsWindow(r, mercrediApresMidi)).toBe(true);
    expect(forbidsWindow(r, lundiMatin)).toBe(false);
  });

  it('sans aucun jour coché, interdit tous les jours', () => {
    // C'est ce qui permet « jamais après 16h », sans énumérer la semaine.
    const r = rule({ params: { range: { from: '16:00', to: '18:00' } } });
    expect(forbidsWindow(r, { day: 1, startMin: 960, endMin: 1020 })).toBe(true);
    expect(forbidsWindow(r, { day: 5, startMin: 960, endMin: 1020 })).toBe(true);
    expect(forbidsWindow(r, lundiMatin)).toBe(false);
  });

  it('n’interdit que la plage donnée', () => {
    const r = rule({ params: { days: [3], range: { from: '12:00', to: '18:00' } } });
    expect(forbidsWindow(r, mercrediMatin)).toBe(false);
    expect(forbidsWindow(r, mercrediApresMidi)).toBe(true);
  });

  it('interdit dès qu’il y a chevauchement, même partiel', () => {
    const r = rule({ params: { days: [3], range: { from: '12:00', to: '18:00' } } });
    // Un cours de 11h à 13h déborde sur l'interdiction : il est refusé.
    expect(forbidsWindow(r, { day: 3, startMin: 660, endMin: 780 })).toBe(true);
    // Un cours qui finit pile à midi ne déborde pas.
    expect(forbidsWindow(r, { day: 3, startMin: 660, endMin: 720 })).toBe(false);
    // Un cours qui commence pile à 18h non plus.
    expect(forbidsWindow(r, { day: 3, startMin: 1080, endMin: 1140 })).toBe(false);
  });

  it('retombe sur la journée entière si la plage est illisible ou à l’envers', () => {
    expect(forbidsWindow(rule({ params: { days: [3], range: { from: 'midi', to: '18:00' } } }), mercrediMatin)).toBe(true);
    expect(forbidsWindow(rule({ params: { days: [3], range: { from: '18:00', to: '12:00' } } }), mercrediMatin)).toBe(true);
  });

  it('ignore les règles qui ne parlent pas de temps', () => {
    expect(forbidsWindow(rule({ code: 'MAX_PER_DAY', params: { max: 2 } }), mercrediMatin)).toBe(false);
  });
});

describe('isWindowAllowed et blockingRules', () => {
  const jamaisEpsMercredi = rule({ scopeType: 'SUBJECT', scopeId: 'eps', params: { days: [3] } });
  const koffiPasLundi = rule({ scopeType: 'TEACHER', scopeId: 'koffi', params: { days: [1] } });

  it('laisse passer ce qu’aucune règle n’interdit', () => {
    expect(isWindowAllowed([jamaisEpsMercredi, koffiPasLundi], course, { day: 2, startMin: 480, endMin: 540 })).toBe(true);
  });

  it('refuse dès qu’une seule règle s’y oppose', () => {
    expect(isWindowAllowed([jamaisEpsMercredi, koffiPasLundi], course, mercrediMatin)).toBe(false);
    expect(isWindowAllowed([jamaisEpsMercredi, koffiPasLundi], course, lundiMatin)).toBe(false);
  });

  it('nomme les règles en cause, pour que le diagnostic soit utile', () => {
    const bloquantes = blockingRules([jamaisEpsMercredi, koffiPasLundi], course, mercrediMatin);
    expect(bloquantes).toHaveLength(1);
    expect(bloquantes[0]!.scopeType).toBe('SUBJECT');
  });

  it('peut en nommer plusieurs à la fois', () => {
    const toutLeMercredi = rule({ params: { days: [3] } });
    expect(blockingRules([jamaisEpsMercredi, toutLeMercredi], course, mercrediMatin)).toHaveLength(2);
  });

  it('ne bloque rien quand aucune règle n’est définie', () => {
    expect(isWindowAllowed([], course, mercrediMatin)).toBe(true);
  });
});

describe('loadLimits', () => {
  const cours = (taskIndex: number, over: Partial<CourseScope> = {}): CourseTask => ({
    taskIndex,
    scope: { subjectId: 'maths', classIds: ['6e1'], levelIds: ['6e'], teacherIds: ['koffi'], ...over },
  });

  it('ignore les règles qui ne parlent pas de charge', () => {
    expect(loadLimits([rule({ params: { days: [3] } })], [cours(0)])).toEqual([]);
  });

  it('rassemble les tâches d’un enseignant sous un seul plafond', () => {
    const r = rule({ code: 'MAX_CONSECUTIVE', scopeType: 'TEACHER', scopeId: 'koffi', params: { max: 2 } });
    const limits = loadLimits([r], [cours(0), cours(1), cours(2, { teacherIds: ['kone'] })]);
    expect(limits).toHaveLength(1);
    expect(limits[0]!.taskIndexes).toEqual([0, 1]);
    expect(limits[0]!.maxConsecutive).toBe(2);
    expect(limits[0]!.maxPerDay).toBeNull();
  });

  it('scinde une règle de niveau classe par classe', () => {
    // « Pas plus de 6 séances par jour en 6ème » vaut pour CHAQUE sixième,
    // pas pour le total des six sixièmes réunies.
    const r = rule({ code: 'MAX_PER_DAY', scopeType: 'LEVEL', scopeId: '6e', params: { max: 6 } });
    const limits = loadLimits([r], [cours(0, { classIds: ['6e1'] }), cours(1, { classIds: ['6e2'] })]);
    expect(limits).toHaveLength(2);
    expect(limits.map((l) => l.taskIndexes)).toEqual([[0], [1]]);
    expect(limits.every((l) => l.maxPerDay === 6)).toBe(true);
  });

  it('scinde de même une règle d’établissement', () => {
    const r = rule({ code: 'MAX_PER_DAY', scopeType: 'SCHOOL', params: { max: 8 } });
    const limits = loadLimits([r], [cours(0, { classIds: ['6e1'] }), cours(1, { classIds: ['5e1'] })]);
    expect(limits).toHaveLength(2);
  });

  it('ne scinde pas une règle de matière : elle vise la matière partout', () => {
    const r = rule({ code: 'MAX_PER_DAY', scopeType: 'SUBJECT', scopeId: 'maths', params: { max: 2 } });
    const limits = loadLimits([r], [cours(0, { classIds: ['6e1'] }), cours(1, { classIds: ['6e2'] })]);
    expect(limits).toHaveLength(1);
    expect(limits[0]!.taskIndexes).toEqual([0, 1]);
  });

  it('refuse un paramètre absurde plutôt que d’inventer un plafond', () => {
    expect(loadLimits([rule({ code: 'MAX_PER_DAY', params: {} })], [cours(0)])).toEqual([]);
    expect(loadLimits([rule({ code: 'MAX_PER_DAY', params: { max: -1 } })], [cours(0)])).toEqual([]);
  });

  it('ne produit rien quand aucune tâche n’est concernée', () => {
    const r = rule({ code: 'MAX_PER_DAY', scopeType: 'TEACHER', scopeId: 'absent', params: { max: 2 } });
    expect(loadLimits([r], [cours(0)])).toEqual([]);
  });
});

describe('préférences', () => {
  const cours = (taskIndex: number, over: Partial<CourseScope> = {}): CourseTask => ({
    taskIndex,
    scope: { subjectId: 'maths', classIds: ['6e1'], levelIds: ['6e'], teacherIds: ['koffi'], ...over },
  });

  // Une journée de quatre créneaux : 8h, 9h, 13h, 14h.
  const slots: SlotInfo[] = [
    { index: 0, day: 1, rank: 0, lastOfDay: false, startMin: 480 },
    { index: 1, day: 1, rank: 1, lastOfDay: false, startMin: 540 },
    { index: 2, day: 1, rank: 2, lastOfDay: false, startMin: 780 },
    { index: 3, day: 1, rank: 3, lastOfDay: true, startMin: 840 },
  ];
  const poids = () => 10;

  it('« plutôt le matin » pénalise l’après-midi, pas le matin', () => {
    const r = rule({ code: 'PREFERRED_DAY_PART', scopeType: 'SUBJECT', scopeId: 'maths', params: { part: 'MORNING' } });
    const [pen] = slotPenalties([r], [cours(0)], slots, poids);
    expect(pen!.slots).toEqual([2, 3]);
    expect(pen!.weight).toBe(10);
  });

  it('« plutôt l’après-midi » fait l’inverse', () => {
    const r = rule({ code: 'PREFERRED_DAY_PART', scopeType: 'SCHOOL', params: { part: 'AFTERNOON' } });
    expect(slotPenalties([r], [cours(0)], slots, poids)[0]!.slots).toEqual([0, 1]);
  });

  it('« jamais en dernière heure » ne vise que le dernier créneau du jour', () => {
    const r = rule({ code: 'NOT_LAST_SLOT', scopeType: 'SUBJECT', scopeId: 'maths', params: {} });
    expect(slotPenalties([r], [cours(0)], slots, poids)[0]!.slots).toEqual([3]);
  });

  it('ignore une demi-journée mal renseignée plutôt que de deviner', () => {
    const r = rule({ code: 'PREFERRED_DAY_PART', params: { part: 'SOIR' } });
    expect(slotPenalties([r], [cours(0)], slots, poids)).toEqual([]);
  });

  it('les trous se comptent classe par classe', () => {
    const r = rule({ code: 'NO_GAPS', scopeType: 'LEVEL', scopeId: '6e', params: {} });
    const pens = gapPenalties([r], [cours(0, { classIds: ['6e1'] }), cours(1, { classIds: ['6e1'] }), cours(2, { classIds: ['6e2'] })], poids);
    // Deux cours en 6e1 : un groupe. Un seul en 6e2 : aucun trou possible.
    expect(pens).toHaveLength(1);
    expect(pens[0]!.taskIndexes).toEqual([0, 1]);
  });

  it('les trous d’un enseignant se comptent par enseignant', () => {
    const r = rule({ code: 'NO_GAPS', scopeType: 'TEACHER', scopeId: 'koffi', params: {} });
    const pens = gapPenalties([r], [cours(0, { classIds: ['6e1'] }), cours(1, { classIds: ['5e2'] })], poids);
    // Deux classes différentes, mais un seul professeur : un seul groupe.
    expect(pens).toHaveLength(1);
    expect(pens[0]!.taskIndexes).toEqual([0, 1]);
  });

  it('« répartir sur des jours différents » devient « au plus une par jour »', () => {
    const r = rule({ code: 'SPREAD_DAYS', scopeType: 'SUBJECT', scopeId: 'maths', params: {} });
    const limits = spreadLimits([r], [cours(0), cours(1)], poids);
    expect(limits).toHaveLength(1);
    expect(limits[0]!.maxPerDay).toBe(1);
    expect(limits[0]!.weight).toBe(10);
  });

  it('un plafond dur n’a pas de poids, un plafond souple en a un', () => {
    const dur = rule({ code: 'MAX_PER_DAY', scopeType: 'SUBJECT', scopeId: 'maths', params: { max: 2 } });
    expect(loadLimits([dur], [cours(0)])[0]!.weight).toBeNull();
  });
});
