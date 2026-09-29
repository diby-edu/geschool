import { describe, expect, it } from 'vitest';
import { gradingState } from './grading';

const win = (a: string | null, b: string | null, o: string | null = null) => ({ grading_starts_on: a, grading_ends_on: b, grading_override: o });

describe('gradingState (meme regle que app.grading_is_open)', () => {
  it('ouverte entre les dates (bornes incluses), fermee automatiquement après', () => {
    expect(gradingState(win('2026-11-30', '2026-12-18'), '2026-11-30')).toEqual({ open: true, source: 'dates' });
    expect(gradingState(win('2026-11-30', '2026-12-18'), '2026-12-18')).toEqual({ open: true, source: 'dates' });
    expect(gradingState(win('2026-11-30', '2026-12-18'), '2026-12-19')).toEqual({ open: false, source: 'dates' });
    expect(gradingState(win('2026-11-30', '2026-12-18'), '2026-11-29')).toEqual({ open: false, source: 'dates' });
  });
  it('la direction peut ouvrir apres la date de fin, ou fermer avant', () => {
    expect(gradingState(win('2026-11-30', '2026-12-18', 'OPEN'), '2026-12-25')).toEqual({ open: true, source: 'manual' });
    expect(gradingState(win('2026-11-30', '2026-12-18', 'CLOSED'), '2026-12-05')).toEqual({ open: false, source: 'manual' });
  });
  it('sans dates ni choix : fermee, « rien de configure »', () => {
    expect(gradingState(win(null, null), '2026-12-05')).toEqual({ open: false, source: 'none' });
    expect(gradingState(win('2026-11-30', null), '2026-12-05')).toEqual({ open: false, source: 'none' });
  });
  it('sans dates, l’ouverture manuelle fonctionne quand même', () => {
    expect(gradingState(win(null, null, 'OPEN'), '2026-12-05')).toEqual({ open: true, source: 'manual' });
  });
});
