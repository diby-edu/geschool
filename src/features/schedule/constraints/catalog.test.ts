import { describe, expect, it } from 'vitest';
import {
  CONSTRAINT_CATALOG,
  CONSTRAINT_BY_CODE,
  CONSTRAINT_SCOPES,
  describeRule,
  familyRules,
  rulesForScope,
  validateParams,
  type ConstraintDef,
} from './catalog';

const byCode = (code: string): ConstraintDef => {
  const def = CONSTRAINT_BY_CODE.get(code);
  if (!def) throw new Error(`règle ${code} absente du catalogue`);
  return def;
};

describe('catalogue des contraintes', () => {
  it('n’a aucun code en double', () => {
    const codes = CONSTRAINT_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('déclare pour chaque règle au moins une portée et une sévérité', () => {
    for (const def of CONSTRAINT_CATALOG) {
      expect({ code: def.code, scopes: def.scopes.length > 0 }).toEqual({ code: def.code, scopes: true });
      expect(def.severities.length).toBeGreaterThan(0);
      expect(def.severities).toContain(def.defaultSeverity);
    }
  });

  it('n’expose que des portées connues de la base', () => {
    for (const def of CONSTRAINT_CATALOG) {
      for (const scope of def.scopes) expect(CONSTRAINT_SCOPES).toContain(scope);
    }
  });

  it('donne à chaque règle un exemple parlant, pas seulement un libellé', () => {
    for (const def of CONSTRAINT_CATALOG) {
      expect({ code: def.code, exemple: def.example.length > 15 }).toEqual({ code: def.code, exemple: true });
    }
  });

  it('garde « moment interdit » ouvert à toutes les portées : c’est la règle fourre-tout', () => {
    expect(byCode('TIME_FORBIDDEN').scopes).toEqual([...CONSTRAINT_SCOPES]);
  });

  it('n’autorise pas d’imposer une demi-journée : ce serait presque toujours infaisable', () => {
    expect(byCode('PREFERRED_DAY_PART').severities).toEqual(['SOFT']);
  });

  it('n’autorise pas d’exiger zéro trou : ce serait parfois sans issue', () => {
    expect(byCode('NO_GAPS').severities).toEqual(['SOFT']);
  });

  it('propose d’éviter les trous pour une classe comme pour un enseignant', () => {
    // La préférence la plus demandée par les établissements.
    expect(byCode('NO_GAPS').scopes).toContain('CLASS');
    expect(byCode('NO_GAPS').scopes).toContain('TEACHER');
  });

  it('classe chaque règle dans une famille qui a un libellé', () => {
    const total = (['TIME', 'LOAD', 'PLACEMENT', 'GROUPING'] as const)
      .map((f) => familyRules(f).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(CONSTRAINT_CATALOG.length);
  });

  it('propose des règles pour chaque portée', () => {
    for (const scope of CONSTRAINT_SCOPES) {
      expect({ scope, regles: rulesForScope(scope).length > 0 }).toEqual({ scope, regles: true });
    }
  });
});

describe('validateParams', () => {
  it('exige les paramètres obligatoires', () => {
    const problems = validateParams(byCode('MAX_PER_DAY'), {});
    expect(problems.map((p) => p.key)).toContain('max');
  });

  it('laisse passer les paramètres facultatifs absents', () => {
    const problems = validateParams(byCode('TIME_FORBIDDEN'), { days: [3] });
    expect(problems).toEqual([]);
  });

  it('refuse un jour hors semaine', () => {
    expect(validateParams(byCode('TIME_FORBIDDEN'), { days: [0] })).toHaveLength(1);
    expect(validateParams(byCode('TIME_FORBIDDEN'), { days: [8] })).toHaveLength(1);
    expect(validateParams(byCode('TIME_FORBIDDEN'), { days: [1, 7] })).toEqual([]);
  });

  it('borne un nombre de séances', () => {
    expect(validateParams(byCode('MAX_PER_DAY'), { max: 0 })).toHaveLength(1);
    expect(validateParams(byCode('MAX_PER_DAY'), { max: 99 })).toHaveLength(1);
    expect(validateParams(byCode('MAX_PER_DAY'), { max: 6 })).toEqual([]);
  });

  it('refuse une plage horaire mal écrite ou à l’envers', () => {
    const def = byCode('TIME_FORBIDDEN');
    expect(validateParams(def, { days: [3], range: { from: '8h', to: '12:00' } })).toHaveLength(1);
    expect(validateParams(def, { days: [3], range: { from: '12:00', to: '08:00' } })).toHaveLength(1);
    expect(validateParams(def, { days: [3], range: { from: '12:00', to: '18:00' } })).toEqual([]);
  });

  it('n’accepte que matin ou après-midi', () => {
    const def = byCode('PREFERRED_DAY_PART');
    expect(validateParams(def, { part: 'SOIR' })).toHaveLength(1);
    expect(validateParams(def, { part: 'MORNING' })).toEqual([]);
  });

  it('borne la longueur du motif', () => {
    const def = byCode('TIME_FORBIDDEN');
    expect(validateParams(def, { days: [1], reason: 'x'.repeat(200) })).toHaveLength(1);
  });
});

describe('describeRule', () => {
  it('relit une règle en français', () => {
    expect(describeRule(byCode('TIME_FORBIDDEN'), { days: [3], range: { from: '12:00', to: '18:00' } })).toBe(
      'Moment interdit — mercredi · de 12:00 à 18:00',
    );
  });

  it('énumère plusieurs jours', () => {
    expect(describeRule(byCode('TIME_FORBIDDEN'), { days: [2, 5] })).toBe('Moment interdit — mardi, vendredi');
  });

  it('accorde le pluriel des séances', () => {
    expect(describeRule(byCode('MAX_CONSECUTIVE'), { max: 1 })).toBe('Maximum d’affilée — 1 séance');
    expect(describeRule(byCode('MAX_CONSECUTIVE'), { max: 3 })).toBe('Maximum d’affilée — 3 séances');
  });

  it('rend le seul libellé quand la règle n’a aucun paramètre', () => {
    expect(describeRule(byCode('NOT_LAST_SLOT'), {})).toBe('Jamais en dernière heure');
  });
});
