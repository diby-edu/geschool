import { describe, expect, it } from 'vitest';
import { absentAtOpening, courseHours, hourAt, mergeAbsentHours } from './course-hours';

const S = '2026-11-03T14:00:00.000Z';
const E = '2026-11-03T17:00:00.000Z';
const at = (hhmm: string) => Date.parse(`2026-11-03T${hhmm}:00.000Z`);

describe('appel heure par heure', () => {
  it('découpe un cours de 3 h en trois heures', () => {
    expect(courseHours(S, E, 3).map((h) => [h.hour, h.startsIso.slice(11, 16), h.endsIso.slice(11, 16)])).toEqual([
      [1, '14:00', '15:00'],
      [2, '15:00', '16:00'],
      [3, '16:00', '17:00'],
    ]);
  });

  it('un cours d’une heure garde une seule heure', () => {
    expect(courseHours(S, '2026-11-03T15:00:00.000Z', 1)).toHaveLength(1);
  });

  it('trouve l’heure en cours, et rien hors du cours', () => {
    expect(hourAt(S, E, 3, at('14:10'))).toBe(1);
    expect(hourAt(S, E, 3, at('15:00'))).toBe(2);
    expect(hourAt(S, E, 3, at('16:59'))).toBe(3);
    expect(hourAt(S, E, 3, at('17:00'))).toBeNull();
    expect(hourAt(S, E, 3, at('13:59'))).toBeNull();
  });

  it('la 2e heure reprend les absents de la 1re tant que son appel n’est pas fait', () => {
    expect(absentAtOpening([1], 2, false)).toBe(true);
    expect(absentAtOpening([1], 2, true)).toBe(false);
    expect(absentAtOpening([], 1, false)).toBe(false);
    expect(absentAtOpening([1, 2], 3, false)).toBe(true);
  });

  it('une heure ne change que son propre état', () => {
    expect(mergeAbsentHours([1], 2, true)).toEqual([1, 2]);
    expect(mergeAbsentHours([1, 2], 2, false)).toEqual([1]);
    expect(mergeAbsentHours([], 1, false)).toEqual([]);
  });
});
