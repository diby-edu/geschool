import { describe, expect, it } from 'vitest';
import { annualFrom } from './annual-core';

const round = (n: number) => Math.round(n * 100) / 100;

describe('annualFrom — élève arrivé en cours d’année', () => {
  it('élève présent toute l’année : moyenne des trois trimestres', () => {
    expect(
      annualFrom(
        [{ value: 10, previousSchool: null, weight: 1 }, { value: 12, previousSchool: null, weight: 1 }],
        { value: 14, weight: 1 },
        'ATTENDED',
        round,
      ),
    ).toBe(12);
  });

  it('A — arrivé au 2e trimestre : calculée sur les trimestres faits chez nous', () => {
    expect(
      annualFrom(
        [{ value: null, previousSchool: null, weight: 1 }, { value: 12, previousSchool: null, weight: 1 }],
        { value: 14, weight: 1 },
        'ATTENDED',
        round,
      ),
    ).toBe(13);
  });

  it('B — moyenne de l’ancienne école saisie pour le 1er trimestre', () => {
    expect(
      annualFrom(
        [{ value: null, previousSchool: 9, weight: 1 }, { value: 12, previousSchool: null, weight: 1 }],
        { value: 14, weight: 1 },
        'PREVIOUS_SCHOOL',
        round,
      ),
    ).toBe(11.67);
  });

  it('B — ancienne école pas encore saisie : pas de moyenne annuelle', () => {
    expect(
      annualFrom([{ value: null, previousSchool: null, weight: 1 }], { value: 14, weight: 1 }, 'PREVIOUS_SCHOOL', round),
    ).toBeNull();
  });

  it('la moyenne de l’établissement prime toujours sur celle de l’ancienne école', () => {
    expect(annualFrom([{ value: 10, previousSchool: 18, weight: 1 }], { value: 12, weight: 1 }, 'PREVIOUS_SCHOOL', round)).toBe(11);
  });

  it('coefficients de période (1, 2, 2)', () => {
    expect(
      annualFrom(
        [{ value: null, previousSchool: 8, weight: 1 }, { value: 12, previousSchool: null, weight: 2 }],
        { value: 14, weight: 2 },
        'PREVIOUS_SCHOOL',
        round,
      ),
    ).toBe(12);
  });
});
