import { describe, it, expect } from 'vitest';
import { GENERAL_PERMISSION, isAssessmentActionAllowed } from './ownership';

const ME = 'teacher-me';
const COLLEAGUE = 'teacher-colleague';

describe('isAssessmentActionAllowed', () => {
  it('autorise le propriétaire de l’évaluation, sans permission générale', () => {
    expect(isAssessmentActionAllowed({ general: false, assessmentTeacherId: ME, myTeacherId: ME })).toBe(true);
  });

  it('refuse un collègue, même sans rien d’autre à lui reprocher', () => {
    expect(isAssessmentActionAllowed({ general: false, assessmentTeacherId: COLLEAGUE, myTeacherId: ME })).toBe(false);
  });

  it('autorise le détenteur de la permission générale sur l’évaluation d’un collègue', () => {
    expect(isAssessmentActionAllowed({ general: true, assessmentTeacherId: COLLEAGUE, myTeacherId: null })).toBe(true);
  });

  it('autorise la permission générale sur une évaluation sans enseignant', () => {
    expect(isAssessmentActionAllowed({ general: true, assessmentTeacherId: null, myTeacherId: null })).toBe(true);
  });

  it('ne prend pas deux « rien » pour un propriétaire', () => {
    // Membre sans fiche enseignant + évaluation sans enseignant : null === null
    // serait vrai, et ouvrirait l'évaluation à quiconque n'est pas enseignant.
    expect(isAssessmentActionAllowed({ general: false, assessmentTeacherId: null, myTeacherId: null })).toBe(false);
  });

  it('refuse un membre sans fiche enseignant sur l’évaluation d’un enseignant', () => {
    expect(isAssessmentActionAllowed({ general: false, assessmentTeacherId: COLLEAGUE, myTeacherId: null })).toBe(false);
  });

  it('refuse un enseignant sur une évaluation sans enseignant', () => {
    expect(isAssessmentActionAllowed({ general: false, assessmentTeacherId: null, myTeacherId: ME })).toBe(false);
  });
});

describe('GENERAL_PERMISSION', () => {
  it('nomme les trois permissions générales que le rôle Enseignant ne détient plus (0051)', () => {
    expect(GENERAL_PERMISSION).toEqual({
      update: 'assessments.update',
      delete: 'assessments.delete',
      grade: 'grades.create',
    });
  });
});
