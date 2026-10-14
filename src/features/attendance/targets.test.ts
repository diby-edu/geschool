import { describe, expect, it } from 'vitest';
import { audienceOf, clampLateMinutes, uniqueStudents } from './targets';
import { formatHours } from './hours';

describe('audienceOf — les publics d’un cours', () => {
  it('un cours de groupe (LV2) a bien un public, plus une liste vide', () => {
    const a = audienceOf([{ class_id: null, group_id: 'g1', classes: null, groups: { name: 'Espagnol 4e' } }]);
    expect(a).toEqual({ classIds: [], groupIds: ['g1'], label: 'Espagnol 4e' });
  });

  it('un cours commun garde TOUTES ses classes, pas seulement la première', () => {
    const a = audienceOf([
      { class_id: 'c1', group_id: null, classes: { name: '6e A' }, groups: null },
      { class_id: 'c2', group_id: null, classes: { name: '6e B' }, groups: null },
    ]);
    expect(a.classIds).toEqual(['c1', 'c2']);
    expect(a.label).toBe('6e A + 6e B');
  });

  it('sans cible : un tiret, aucune classe', () => {
    expect(audienceOf(null)).toEqual({ classIds: [], groupIds: [], label: '—' });
  });
});

describe('uniqueStudents', () => {
  it('un élève à la fois dans la classe et dans le groupe n’apparaît qu’une fois', () => {
    expect(uniqueStudents([{ studentId: 'a' }, { studentId: 'b' }, { studentId: 'a' }])).toEqual([
      { studentId: 'a' },
      { studentId: 'b' },
    ]);
  });
});

describe('clampLateMinutes', () => {
  const start = '2026-10-14T08:00:00Z';
  const end = '2026-10-14T08:55:00Z';
  it('un retard ne dépasse jamais la durée du cours', () => {
    expect(clampLateMinutes(90, start, end)).toBe(55);
  });
  it('au moins une minute', () => {
    expect(clampLateMinutes(0, start, end)).toBe(1);
    expect(clampLateMinutes(Number.NaN, start, end)).toBe(1);
  });
  it('un retard normal reste tel quel', () => {
    expect(clampLateMinutes(12, start, end)).toBe(12);
  });
});

describe('formatHours', () => {
  it('écrit les heures comme sur un bulletin', () => {
    expect(formatHours(0)).toBe('0 h');
    expect(formatHours(6)).toBe('6 h');
    expect(formatHours(4.5)).toBe('4 h 30');
    expect(formatHours(0.9166)).toBe('0 h 55');
  });
});
