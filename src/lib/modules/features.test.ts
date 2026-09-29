import { describe, it, expect } from 'vitest';
import { FEATURES, featureEnabled } from './features';

describe('modules activables', () => {
  it('un module absent de la liste des coupés est actif', () => {
    expect(featureEnabled([], 'attendance')).toBe(true);
    expect(featureEnabled(new Set<string>(), 'grades')).toBe(true);
  });

  it('un module coupé ne l’est plus', () => {
    expect(featureEnabled(['attendance'], 'attendance')).toBe(false);
    expect(featureEnabled(new Set(['bulletins']), 'bulletins')).toBe(false);
  });

  it('couper un module n’en coupe pas un autre', () => {
    expect(featureEnabled(['attendance'], 'grades')).toBe(true);
  });

  it('le catalogue ne contient ni doublon ni socle', () => {
    const codes = FEATURES.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
    // Le socle ne se coupe jamais : il ne doit pas figurer au catalogue.
    for (const socle of ['students', 'classes', 'structure', 'roles', 'access', 'academic_years']) {
      expect(codes).not.toContain(socle);
    }
  });
});
