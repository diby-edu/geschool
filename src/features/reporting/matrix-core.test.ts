import { describe, expect, it } from 'vitest';
import { fmt, matrixToCsv, ordinal, rankWithTies, statsOf, type Matrix } from './matrix-core';

describe('rankWithTies — rang à la française', () => {
  it('1, 1, 3 en cas d’égalité ; un élève sans moyenne n’est pas classé', () => {
    expect(rankWithTies([12, 15, 15, null, 9])).toEqual([
      { rank: 3, exAequo: false },
      { rank: 1, exAequo: true },
      { rank: 1, exAequo: true },
      { rank: null, exAequo: false },
      { rank: 4, exAequo: false },
    ]);
  });
});

describe('ordinal', () => {
  it('1er, 1re, 5e, 21e ex', () => {
    expect(ordinal({ rank: 1, exAequo: false }, false)).toBe('1er');
    expect(ordinal({ rank: 1, exAequo: false }, true)).toBe('1re');
    expect(ordinal({ rank: 5, exAequo: false }, true)).toBe('5e');
    expect(ordinal({ rank: 21, exAequo: true }, false)).toBe('21e ex');
    expect(ordinal({ rank: null, exAequo: false }, false)).toBe('');
  });
});

describe('fmt et statsOf', () => {
  it('virgule décimale, tiret sans valeur', () => {
    expect(fmt(13.5)).toBe('13,50');
    expect(fmt(null)).toBe('—');
  });
  it('moyenne, plus forte, plus faible', () => {
    expect(statsOf([10, 12, null, 14])).toEqual({ average: 12, max: 14, min: 10 });
  });
});

describe('matrixToCsv', () => {
  it('deux lignes d’en-tête, « Dispensé », séparateur point-virgule', () => {
    const m: Matrix = {
      className: 'Tle D1', periodName: '1er trimestre', schoolName: 'Lycée', yearName: '2026-2027', headTeacher: null,
      subjects: [
        { id: 'fr', name: 'Français', coefficient: 3, classAverage: 11.5 },
        { id: 'eps', name: 'EPS', coefficient: 1, classAverage: 13 },
      ],
      rows: [{
        studentId: 's1', name: 'KONE Awa', female: true,
        cells: { fr: { average: 12, rank: 1, exAequo: false, exempt: false }, eps: { average: null, rank: null, exAequo: false, exempt: true } },
        general: { average: 12, rank: 1, exAequo: false }, recalls: [], annual: null,
      }],
      recallLabels: [], hasAnnual: false,
    };
    const csv = matrixToCsv(m);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toContain('Français (coef 3, moy. classe 11,50)');
    expect(lines[2]).toBe(';;Moy;Rang;Moy;Rang;Moy;Rang');
    expect(lines[3]).toBe('1;KONE Awa;12,00;1re;Dispensé;;12,00;1re');
  });
});
