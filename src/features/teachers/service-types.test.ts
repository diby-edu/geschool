import { describe, expect, it } from 'vitest';
import { effectiveBounds, NO_BOUNDS, type ServiceDefaults } from './service-types';

const defaults: ServiceDefaults = {
  PERMANENT: { min: 15, max: 18 },
  CONTRACT: { min: null, max: 15 },
  HOURLY: { min: null, max: 12 },
  INTERN: NO_BOUNDS,
  OTHER: NO_BOUNDS,
};

const teacher = (over: Partial<Parameters<typeof effectiveBounds>[0]> = {}) => ({
  weekly_minutes_min: null,
  weekly_minutes_max: null,
  employment_type: 'PERMANENT',
  ...over,
});

describe('effectiveBounds', () => {
  it('reprend le contrat quand la fiche ne dit rien', () => {
    // 15 et 18 séances de 55 min.
    expect(effectiveBounds(teacher(), defaults, 55)).toEqual({
      minMinutes: 825,
      maxMinutes: 990,
      fromDefault: true,
    });
  });

  it('suit la durée réelle d’une séance', () => {
    expect(effectiveBounds(teacher(), defaults, 60).maxMinutes).toBe(1080);
  });

  it('laisse toujours la fiche l’emporter sur le contrat', () => {
    const result = effectiveBounds(teacher({ weekly_minutes_max: 600 }), defaults, 55);
    expect(result).toEqual({ minMinutes: null, maxMinutes: 600, fromDefault: false });
  });

  it('considère la fiche renseignée dès qu’UNE des deux bornes l’est', () => {
    // Un minimum saisi seul ne doit pas laisser le plafond du contrat s'appliquer :
    // l'école a décidé pour cet enseignant, on ne mélange pas les deux sources.
    const result = effectiveBounds(teacher({ weekly_minutes_min: 300 }), defaults, 55);
    expect(result.maxMinutes).toBeNull();
    expect(result.fromDefault).toBe(false);
  });

  it('rend des bornes vides quand le contrat n’est pas réglé', () => {
    expect(effectiveBounds(teacher({ employment_type: 'INTERN' }), defaults, 55)).toEqual({
      minMinutes: null,
      maxMinutes: null,
      fromDefault: false,
    });
  });

  it('ne casse pas sur un type de contrat inconnu', () => {
    expect(effectiveBounds(teacher({ employment_type: 'BENEVOLE' }), defaults, 55)).toEqual({
      minMinutes: null,
      maxMinutes: null,
      fromDefault: false,
    });
  });

  it('applique un plafond de contrat sans minimum', () => {
    const result = effectiveBounds(teacher({ employment_type: 'HOURLY' }), defaults, 55);
    expect(result).toEqual({ minMinutes: null, maxMinutes: 660, fromDefault: true });
  });
});
