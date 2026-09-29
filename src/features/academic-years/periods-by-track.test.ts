import { describe, it, expect } from 'vitest';
import { periodsForTrack, periodScopeLabel, trackChoices, parseTracks, formatTracks, mainTrack } from './periods-by-track';

const trimestres = [
  { id: 't1', tracks: null },
  { id: 't2', tracks: null },
];
const semestres = [
  { id: 's1', tracks: ['TECHNIQUE', 'PROFESSIONNEL'] },
  { id: 's2', tracks: ['TECHNIQUE', 'PROFESSIONNEL'] },
];

describe('periodsForTrack', () => {
  it('l’ordre a ses propres périodes : elles priment', () => {
    expect(periodsForTrack([...trimestres, ...semestres], 'PROFESSIONNEL').map((p) => p.id)).toEqual(['s1', 's2']);
    expect(periodsForTrack([...trimestres, ...semestres], 'TECHNIQUE').map((p) => p.id)).toEqual(['s1', 's2']);
  });

  it('sinon, les périodes communes de l’école', () => {
    expect(periodsForTrack([...trimestres, ...semestres], 'GENERAL').map((p) => p.id)).toEqual(['t1', 't2']);
    expect(periodsForTrack(trimestres, 'TECHNIQUE').map((p) => p.id)).toEqual(['t1', 't2']);
  });

  it('aucune période : liste vide, jamais une erreur', () => {
    expect(periodsForTrack([], 'GENERAL')).toEqual([]);
  });
});

describe('periodScopeLabel', () => {
  it('nomme les ordres, ou rien quand la période vaut pour tous', () => {
    expect(periodScopeLabel(['PROFESSIONNEL'])).toBe('professionnel');
    expect(periodScopeLabel(['TECHNIQUE', 'PROFESSIONNEL'])).toBe('technique et professionnel');
    expect(periodScopeLabel(null)).toBeNull();
    expect(periodScopeLabel([])).toBeNull();
  });
});

describe('choix du formulaire', () => {
  it('propose le choix groupé quand l’école a le technique ET le professionnel', () => {
    const values = trackChoices(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']).map((c) => c.value);
    expect(values).toEqual(['', 'GENERAL', 'TECHNIQUE', 'PROFESSIONNEL', 'TECHNIQUE+PROFESSIONNEL']);
  });

  it('un seul ordre : rien à choisir, la période vaut pour toute l’école', () => {
    expect(trackChoices(['GENERAL']).map((c) => c.value)).toEqual(['', 'GENERAL']);
  });

  it('aller-retour entre le formulaire et la base', () => {
    expect(parseTracks('TECHNIQUE+PROFESSIONNEL')).toEqual(['TECHNIQUE', 'PROFESSIONNEL']);
    expect(parseTracks('')).toBeNull();
    expect(parseTracks(null)).toBeNull();
    expect(formatTracks(['TECHNIQUE', 'PROFESSIONNEL'])).toBe('TECHNIQUE+PROFESSIONNEL');
    expect(formatTracks(null)).toBe('');
  });
});

describe('mainTrack', () => {
  it('le général l’emporte quand l’école l’a', () => {
    expect(mainTrack(['GENERAL', 'TECHNIQUE'])).toBe('GENERAL');
    expect(mainTrack([])).toBe('GENERAL');
  });

  it('sinon le technique, puis le professionnel', () => {
    expect(mainTrack(['TECHNIQUE', 'PROFESSIONNEL'])).toBe('TECHNIQUE');
    expect(mainTrack(['PROFESSIONNEL'])).toBe('PROFESSIONNEL');
  });
});
