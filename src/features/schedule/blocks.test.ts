import { describe, expect, it } from 'vitest';
import { coursePlan, describeBlocks, parseBlocks, totalHours } from './blocks';

describe('6 h de maths par semaine, selon le découpage choisi', () => {
  it('« 1+1+1+1+1+1 » : 6 cours d’1 h', () => {
    const r = parseBlocks('1+1+1+1+1+1');
    expect(r).toEqual({ ok: true, blocks: [1, 1, 1, 1, 1, 1] });
    expect(describeBlocks([1, 1, 1, 1, 1, 1])).toBe('6 cours de 1 h');
  });

  it('« 2+2+2 » : 3 cours de 2 h', () => {
    const r = parseBlocks('2+2+2');
    expect(r.ok && r.blocks).toEqual([2, 2, 2]);
    expect(coursePlan({ blockHours: [2, 2, 2], sessionsCount: 3, sessionDurationMinutes: null, weeklyMinutes: 360 })).toEqual([2, 2, 2]);
  });

  it('« 4+2 » : 1 cours de 4 h et 1 cours de 2 h — 2 cours, 6 h', () => {
    const r = parseBlocks('4 + 2');
    expect(r.ok && r.blocks).toEqual([4, 2]);
    expect(totalHours([4, 2])).toBe(6);
    expect(describeBlocks([4, 2])).toBe('4 h + 2 h');
  });

  it('« 6 » : 1 cours de 6 h d’affilée (6 créneaux, pas 7)', () => {
    expect(coursePlan({ blockHours: null, sessionsCount: 1, sessionDurationMinutes: 360, weeklyMinutes: 360 })).toEqual([6]);
  });
});

describe('enseignements déjà enregistrés (sans découpage explicite)', () => {
  it('6 séances de 55 min : 6 cours d’1 h', () => {
    expect(coursePlan({ blockHours: null, sessionsCount: 6, sessionDurationMinutes: 55, weeklyMinutes: 360 })).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it('3 séances de 110 min (2 créneaux de 55) : 3 cours de 2 h', () => {
    expect(coursePlan({ blockHours: null, sessionsCount: 3, sessionDurationMinutes: 110, weeklyMinutes: 360 })).toEqual([2, 2, 2]);
  });
  it('règle « grouper par 2 » sur 6 cours d’1 h : 3 cours de 2 h', () => {
    expect(coursePlan({ blockHours: null, sessionsCount: 6, sessionDurationMinutes: 55, weeklyMinutes: 360 }, 2)).toEqual([2, 2, 2]);
  });
  it('règle « grouper par 2 » sur 5 cours : 2 cours de 2 h et 1 cours d’1 h', () => {
    expect(coursePlan({ blockHours: null, sessionsCount: 5, sessionDurationMinutes: 55, weeklyMinutes: 300 }, 2)).toEqual([2, 2, 1]);
  });
});

describe('saisies refusées', () => {
  it('vide, demi-heure, plus de 8 h', () => {
    expect(parseBlocks('').ok).toBe(false);
    expect(parseBlocks('1,5+2').ok).toBe(false);
    expect(parseBlocks('9').ok).toBe(false);
  });
});
