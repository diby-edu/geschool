import { describe, it, expect } from 'vitest';
import { ROOM_FEATURE_SUGGESTIONS, ROOM_TYPE_SUGGESTIONS, suggestCode } from './suggestions';

describe('suggestions de salles', () => {
  it('aucun code en double, et des codes utilisables', () => {
    for (const list of [ROOM_TYPE_SUGGESTIONS, ROOM_FEATURE_SUGGESTIONS]) {
      const codes = list.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const s of list) {
        expect(s.code).toMatch(/^[A-Z0-9-]{2,20}$/);
        expect(s.name.length).toBeGreaterThan(2);
      }
    }
  });

  it('couvre le technique et le professionnel, pas seulement le général', () => {
    const names = ROOM_TYPE_SUGGESTIONS.map((s) => s.name.toLowerCase()).join(' ');
    for (const mot of ['atelier', 'cuisine', 'restaurant', 'laboratoire', 'informatique']) {
      expect(names).toContain(mot);
    }
  });

  it('commence par les quatre salles d’un établissement général', () => {
    expect(ROOM_TYPE_SUGGESTIONS.slice(0, 4).map((s) => s.name)).toEqual([
      'Salle de classe',
      'Laboratoire',
      'Salle informatique',
      'Terrain de sport',
    ]);
  });

  it('chaque type déclare au moins un ordre', () => {
    for (const s of ROOM_TYPE_SUGGESTIONS) {
      expect(s.tracks.length).toBeGreaterThan(0);
      for (const t of s.tracks) expect(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']).toContain(t);
    }
  });

  it('n’expose aucun atelier ni salle d’application au général', () => {
    const general = ROOM_TYPE_SUGGESTIONS.filter((s) => s.tracks.includes('GENERAL')).map((s) => s.name.toLowerCase());
    for (const mot of ['atelier', 'cuisine pédagogique', 'restaurant']) {
      expect(general.join(' ')).not.toContain(mot);
    }
  });

  it('propose bien les ateliers au technique et au professionnel', () => {
    for (const track of ['TECHNIQUE', 'PROFESSIONNEL'] as const) {
      const noms = ROOM_TYPE_SUGGESTIONS.filter((s) => s.tracks.includes(track)).map((s) => s.name.toLowerCase());
      expect(noms.some((n) => n.startsWith('atelier'))).toBe(true);
      // Les salles ordinaires restent proposées partout : un lycée technique a
      // aussi des salles de classe.
      expect(noms).toContain('salle de classe');
    }
  });
});

describe('suggestCode', () => {
  it('enlève accents et ponctuation, garde une forme courte', () => {
    expect(suggestCode('Atelier froid et climatisation')).toBe('ATELIER-FROID-ET-CLI');
    expect(suggestCode('Cuisine pédagogique')).toBe('CUISINE-PEDAGOGIQUE');
    expect(suggestCode('  ')).toBe('');
  });

  it('ne dépasse jamais vingt caractères', () => {
    expect(suggestCode('Salle vraiment tres longue pour un code').length).toBeLessThanOrEqual(20);
  });
});
