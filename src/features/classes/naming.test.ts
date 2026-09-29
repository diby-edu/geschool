import { describe, it, expect } from 'vitest';
import { classNames, letterSuffix, planClasses, suffixesFor } from './naming';

describe('suffixes', () => {
  it('chiffres : 1, 2, 3…', () => {
    expect(suffixesFor(3, 'DIGITS')).toEqual(['1', '2', '3']);
  });

  it('lettres : A, B, … Z, puis AA', () => {
    expect(suffixesFor(3, 'LETTERS')).toEqual(['A', 'B', 'C']);
    expect(letterSuffix(25)).toBe('Z');
    expect(letterSuffix(26)).toBe('AA');
    expect(letterSuffix(27)).toBe('AB');
  });

  it('aucune classe demandée : aucune créée', () => {
    expect(suffixesFor(0, 'DIGITS')).toEqual([]);
    expect(suffixesFor(-5, 'DIGITS')).toEqual([]);
  });
});

describe('classNames', () => {
  it('colle le suffixe au niveau', () => {
    expect(classNames('6EME', 'Sixième', '1')).toEqual({ suffix: '1', code: '6EME 1', name: 'Sixième 1' });
  });

  it('sans suffixe, la classe porte le nom du niveau', () => {
    expect(classNames('TLE-D', 'Terminale D', '')).toEqual({ suffix: '', code: 'TLE-D', name: 'Terminale D' });
  });

  it('le code est en majuscules, le nom garde sa casse', () => {
    expect(classNames('2nde-ab', '2nde AB', 'b').code).toBe('2NDE-AB B');
    expect(classNames('2nde-ab', '2nde AB', 'b').name).toBe('2nde AB b');
  });

  it('le code ne dépasse pas vingt caractères', () => {
    expect(classNames('1-BT-COMPTA-COMMERCE', '1 BT Compta', '12').code.length).toBeLessThanOrEqual(20);
  });
});

describe('planClasses', () => {
  it('une seule classe', () => {
    expect(planClasses({ levelCode: '6EME', levelName: 'Sixième', mode: 'ONE', suffix: 'A' })).toEqual([
      { suffix: 'A', code: '6EME A', name: 'Sixième A' },
    ]);
  });

  it('quinze sixièmes, numérotées', () => {
    const plan = planClasses({ levelCode: '6EME', levelName: 'Sixième', mode: 'MANY', count: 15, numbering: 'DIGITS' });
    expect(plan).toHaveLength(15);
    expect(plan[0]!.code).toBe('6EME 1');
    expect(plan[14]!.code).toBe('6EME 15');
  });

  it('deux classes en lettres', () => {
    const plan = planClasses({ levelCode: '2NDE-A', levelName: '2nde A', mode: 'MANY', count: 2, numbering: 'LETTERS' });
    expect(plan.map((p) => p.name)).toEqual(['2nde A A', '2nde A B']);
  });

  it('aucun doublon dans une série', () => {
    const plan = planClasses({ levelCode: '6EME', levelName: 'Sixième', mode: 'MANY', count: 30, numbering: 'LETTERS' });
    expect(new Set(plan.map((p) => p.code)).size).toBe(30);
  });
});
