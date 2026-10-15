import { describe, expect, it } from 'vitest';
import { termPhase, termPhaseMessage } from './grading';

const d = { grades_stop_on: '2026-12-01', student_check_ends_on: '2026-12-05', head_check_ends_on: '2026-12-08' };

describe('termPhase — les étapes de fin de trimestre', () => {
  it('sans date : la saisie reste ouverte', () => {
    expect(termPhase({ grades_stop_on: null, student_check_ends_on: null, head_check_ends_on: null }, '2026-12-10')).toBe('OPEN');
  });
  it('avant l’arrêt : saisie', () => expect(termPhase(d, '2026-11-30')).toBe('OPEN'));
  it('du 1er au 5 : vérification avec les élèves', () => {
    expect(termPhase(d, '2026-12-01')).toBe('STUDENT_CHECK');
    expect(termPhase(d, '2026-12-05')).toBe('STUDENT_CHECK');
  });
  it('du 6 au 8 : vérification du professeur principal', () => {
    expect(termPhase(d, '2026-12-06')).toBe('HEAD_CHECK');
    expect(termPhase(d, '2026-12-08')).toBe('HEAD_CHECK');
  });
  it('à partir du 9 : notes figées', () => expect(termPhase(d, '2026-12-09')).toBe('FROZEN'));
  it('message du professeur pendant la vérification', () => {
    expect(termPhaseMessage(d, '2026-12-02')).toContain('jusqu’au 8 déc. 2026');
  });
});
