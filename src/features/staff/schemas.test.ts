import { describe, expect, it } from 'vitest';
import { staffSchema, staffUpdateSchema } from './schemas';

const valid = {
  lastName: 'Koné',
  firstName: 'Aminata',
  gender: 'F',
  employmentType: 'PERMANENT',
  functions: ['SECRETARY'],
  phone: '07 08 09 00 01',
};

describe('staffSchema', () => {
  it('accepte un dossier minimal', () => {
    expect(staffSchema.safeParse(valid).success).toBe(true);
  });

  it('exige au moins une fonction', () => {
    const r = staffSchema.safeParse({ ...valid, functions: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Choisissez au moins une fonction.');
  });

  it('refuse le fondateur, le comptable, l’enseignant et le parent comme fonction du personnel', () => {
    for (const code of ['SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT']) {
      expect(staffSchema.safeParse({ ...valid, functions: [code] }).success).toBe(false);
    }
  });

  it('accepte plusieurs fonctions cumulées', () => {
    expect(staffSchema.safeParse({ ...valid, functions: ['CENSOR', 'IT_ADMIN'] }).success).toBe(true);
  });

  it('exige le sexe, le type de contrat, le nom, le prénom et le téléphone', () => {
    for (const key of ['gender', 'employmentType', 'lastName', 'firstName', 'phone'] as const) {
      const { [key]: _omitted, ...rest } = valid;
      expect(staffSchema.safeParse(rest).success).toBe(false);
    }
  });

  it('vérifie le format des dates et de l’e-mail, sans exiger ces champs', () => {
    expect(staffSchema.safeParse({ ...valid, birthDate: '2001-13-40x' }).success).toBe(false);
    expect(staffSchema.safeParse({ ...valid, birthDate: '1985-04-12', hireDate: '' }).success).toBe(true);
    expect(staffSchema.safeParse({ ...valid, email: 'pas-un-email' }).success).toBe(false);
    expect(staffSchema.safeParse({ ...valid, email: '' }).success).toBe(true);
  });

  it('refuse un diplôme hors liste', () => {
    expect(staffSchema.safeParse({ ...valid, diploma: 'LICENCE' }).success).toBe(true);
    expect(staffSchema.safeParse({ ...valid, diploma: 'INCONNU' }).success).toBe(false);
  });
});

describe('staffUpdateSchema', () => {
  const { phone: _phone, functions: _functions, ...base } = valid;

  it('ne demande pas le téléphone (il porte l’accès et ne change pas)', () => {
    expect(staffUpdateSchema.safeParse(base).success).toBe(true);
  });

  it('laisse les fonctions facultatives, mais refuse une valeur hors liste', () => {
    expect(staffUpdateSchema.safeParse({ ...base, functions: ['DIRECTOR'] }).success).toBe(true);
    expect(staffUpdateSchema.safeParse({ ...base, functions: ['SCHOOL_ADMIN'] }).success).toBe(false);
  });
});
