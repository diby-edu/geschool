import { describe, it, expect } from 'vitest';
import { OFFICIAL_TRACK_LEVELS, diplomaOf, levelCode } from './official-tracks';

describe('Niveaux officiels du technique', () => {
  const t = OFFICIAL_TRACK_LEVELS.TECHNIQUE;

  it('reprend les séries de la liste, seconde AB puis B', () => {
    expect(t.levels.slice(0, 3).map((l) => l.name)).toEqual(['2NDE AB', '1ERE B', 'TLE B']);
    expect(t.levels.map((l) => l.name)).toContain('TLE F7');
    expect(t.levels).toHaveLength(21);
  });

  it('aucun diplôme : le technique n’en porte pas', () => {
    expect(t.levels.every((l) => l.diploma === null)).toBe(true);
  });
});

describe('Niveaux officiels de la formation professionnelle', () => {
  const p = OFFICIAL_TRACK_LEVELS.PROFESSIONNEL;

  it('garde les noms de l’administration', () => {
    expect(p.levels[0]).toMatchObject({ name: '1 BEP COMPTA', diploma: 'BEP', code: '1-BEP-COMPTA' });
    expect(p.levels.map((l) => l.name)).toContain('FQ Coiffure');
    expect(p.levels.map((l) => l.name)).toContain('CQP CUIS');
  });

  it('range chaque niveau sous son diplôme', () => {
    const byDiploma = new Map<string, number>();
    for (const l of p.levels) byDiploma.set(l.diploma ?? '—', (byDiploma.get(l.diploma ?? '—') ?? 0) + 1);
    expect([...byDiploma.keys()].sort()).toEqual(['BEP', 'BT', 'CAP', 'CQP', 'FQ', '—']);
    expect(byDiploma.get('BEP')).toBe(6);
  });

  it('des codes courts, tous différents', () => {
    const codes = p.levels.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => c.length <= 22 && /^[A-Z0-9-]+$/.test(c))).toBe(true);
  });
});

describe('Lecture du diplôme et du code', () => {
  it('trouve le diplôme dans le nom', () => {
    expect(diplomaOf('2 CAP PLOMB')).toBe('CAP');
    expect(diplomaOf('FQ Coiffure et esthe')).toBe('FQ');
    expect(diplomaOf('Informatique, reseau')).toBeNull();
  });

  it('évite les codes en double', () => {
    const taken = new Set<string>();
    expect(levelCode('1 BT COMPTA', taken)).toBe('1-BT-COMPTA');
    expect(levelCode('1 BT COMPTA', taken)).toBe('1-BT-COMPTA-2');
  });
});
