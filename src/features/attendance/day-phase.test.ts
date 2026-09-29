import { describe, it, expect } from 'vitest';
import { clock, coversNow, sessionPhase } from './day-phase';

// Format renvoyé par l'API pour un timestamptz.
const start = '2026-10-13T10:20:00+00:00';
const end = '2026-10-13T11:15:00+00:00';
const at = (hm: string) => new Date(`2026-10-13T${hm}:00Z`);

describe('coversNow', () => {
  it('reconnaît le cours en cours à partir d’instants complets (pas de « HH:MM »)', () => {
    expect(coversNow(start, end, at('10:45'))).toBe(true);
    expect(coversNow(start, end, at('09:00'))).toBe(false);
  });

  it('accepte une marge avant le début et après la fin', () => {
    expect(coversNow(start, end, at('10:12'), 10)).toBe(true);
    expect(coversNow(start, end, at('11:24'), 10)).toBe(true);
    expect(coversNow(start, end, at('11:26'), 10)).toBe(false);
  });
});

describe('sessionPhase', () => {
  it('à venir, en cours, puis terminée — appel fait ou non', () => {
    expect(sessionPhase(start, end, false, at('10:00'))).toBe('upcoming');
    expect(sessionPhase(start, end, false, at('10:30'))).toBe('ongoing');
    expect(sessionPhase(start, end, true, at('12:00'))).toBe('done');
    expect(sessionPhase(start, end, false, at('12:00'))).toBe('missed');
  });
});

describe('clock', () => {
  it('affiche l’heure dans le fuseau de l’établissement', () => {
    expect(clock(start, 'Africa/Abidjan')).toBe('10:20');
    expect(clock(start, 'Africa/Douala')).toBe('11:20');
  });

  it('retombe sur UTC si le fuseau est inconnu', () => {
    expect(clock(start, 'Pas/UnFuseau')).toBe('10:20');
  });
});
