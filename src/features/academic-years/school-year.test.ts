import { describe, expect, it } from 'vitest';
import { defaultDates, nameFromStart, schoolYearFor, suggestedYears, yearName } from './school-year';

/**
 * Le nom d'une annee scolaire se deduit de la date : le piege est la bascule
 * d'aout, qui fait changer de millesime au milieu de l'annee civile.
 */

describe('schoolYearFor', () => {
  it('en octobre, l’année scolaire est celle qui vient de commencer', () => {
    expect(schoolYearFor(new Date(2026, 9, 4))).toBe(2026);
  });

  it('en mars, c’est encore l’année commencée en septembre', () => {
    expect(schoolYearFor(new Date(2027, 2, 15))).toBe(2026);
  });

  it('bascule en août, pas en septembre : une rentrée préparée en août compte déjà', () => {
    expect(schoolYearFor(new Date(2026, 6, 31))).toBe(2025); // 31 juillet
    expect(schoolYearFor(new Date(2026, 7, 1))).toBe(2026); // 1er août
  });
});

describe('yearName et defaultDates', () => {
  it('nomme l’année par ses deux millésimes', () => {
    expect(yearName(2026)).toBe('2026-2027');
  });

  it('propose du 1er septembre au 31 juillet', () => {
    expect(defaultDates(2026)).toEqual({ startsOn: '2026-09-01', endsOn: '2027-07-31' });
  });
});

describe('suggestedYears', () => {
  it('donne l’an dernier, cette année et l’an prochain', () => {
    const y = suggestedYears(new Date(2026, 9, 4));
    expect(y.map((x) => x.name)).toEqual(['2025-2026', '2026-2027', '2027-2028']);
  });

  it('marque une seule année comme celle en cours', () => {
    const y = suggestedYears(new Date(2026, 9, 4));
    expect(y.filter((x) => x.current).map((x) => x.name)).toEqual(['2026-2027']);
  });

  it('ne laisse aucune année sans dates', () => {
    for (const y of suggestedYears(new Date(2026, 1, 1))) {
      expect(y.startsOn).toMatch(/^\d{4}-09-01$/);
      expect(y.endsOn).toMatch(/^\d{4}-07-31$/);
    }
  });
});

describe('nameFromStart', () => {
  it('déduit le nom d’une date de rentrée', () => {
    expect(nameFromStart('2026-09-01')).toBe('2026-2027');
    expect(nameFromStart('2026-10-15')).toBe('2026-2027');
  });

  it('comprend une école qui démarre en janvier : l’année reste celle de septembre', () => {
    expect(nameFromStart('2027-01-08')).toBe('2026-2027');
  });

  it('refuse ce qui n’est pas une date', () => {
    expect(nameFromStart('la rentrée')).toBeNull();
  });
});
