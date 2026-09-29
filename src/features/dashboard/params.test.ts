import { describe, expect, it } from 'vitest';
import { closeHref, dashHref, parseDashParams } from './params';

const ID = '6f1c2e3a-1b2c-4d5e-8f90-123456789abc';

describe('parseDashParams', () => {
  it('valeurs par défaut', () => {
    expect(parseDashParams({})).toEqual({ panel: null, tid: null, callsTab: 'done', top: 'd', tp: 'd', watch: 'w7', more: false });
  });
  it('ignore toute valeur hors liste (l’URL ne choisit jamais n’importe quoi)', () => {
    const p = parseDashParams({ panel: 'sql', ptab: 'x', top: 'y', tp: 'zzz', watch: '1; drop', more: 'oui' });
    expect(p).toEqual({ panel: null, tid: null, callsTab: 'done', top: 'd', tp: 'd', watch: 'w7', more: false });
  });
  it('le detail d’un enseignant exige un identifiant valide', () => {
    expect(parseDashParams({ panel: 'teacher' }).panel).toBeNull();
    expect(parseDashParams({ panel: 'teacher', tid: 'pas-un-uuid' }).panel).toBeNull();
    const ok = parseDashParams({ panel: 'teacher', tid: ID, tp: 't1' });
    expect(ok.panel).toBe('teacher');
    expect(ok.tid).toBe(ID);
    expect(ok.tp).toBe('t1');
  });
  it('lit les choix valides', () => {
    const p = parseDashParams({ panel: 'calls', ptab: 'missed', top: 'm', watch: 'y', more: '1' });
    expect(p).toMatchObject({ panel: 'calls', callsTab: 'missed', top: 'm', watch: 'y', more: true });
  });
});

describe('liens', () => {
  const base = '/e/ecole/dashboard';
  it('dashHref garde les choix de l’ecran et écarte le reste', () => {
    expect(dashHref(base, { top: 'w', created: '1' }, { panel: 'calls' })).toBe(`${base}?top=w&panel=calls`);
  });
  it('null retire un parametre', () => {
    expect(dashHref(base, { top: 'w', panel: 'abs' }, { panel: null })).toBe(`${base}?top=w`);
  });
  it('closeHref referme le panneau mais garde la periode du Top 5', () => {
    expect(closeHref(base, { panel: 'teacher', tid: ID, tp: 'w', top: 'm' })).toBe(`${base}?top=m`);
    expect(closeHref(base, { panel: 'calls' })).toBe(base);
  });
});
