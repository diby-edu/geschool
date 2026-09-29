import { describe, expect, it } from 'vitest';
import { planCounts, planProgramme, type ExistingEntry, type ProgrammeRow } from './plan';

const entry = (subjectId: string, over: Partial<ExistingEntry> = {}): ExistingEntry => ({
  id: `entry-${subjectId}`,
  subjectId,
  coefficient: 2,
  weeklyMinutes: 120,
  mandatory: true,
  ...over,
});

const row = (subjectId: string, over: Partial<ProgrammeRow> = {}): ProgrammeRow => ({
  subjectId,
  included: true,
  coefficient: 2,
  weeklyMinutes: 120,
  mandatory: true,
  ...over,
});

describe('planProgramme', () => {
  it('ajoute une matière cochée qui n’était pas au programme', () => {
    const plan = planProgramme([], [row('maths', { coefficient: 4, weeklyMinutes: 300 })]);
    expect(plan.upsert).toEqual([{ subjectId: 'maths', coefficient: 4, weeklyMinutes: 300, mandatory: true }]);
    expect(plan.added).toBe(1);
    expect(plan.removeIds).toEqual([]);
  });

  it('retire une matière décochée', () => {
    const plan = planProgramme([entry('arts')], [row('arts', { included: false })]);
    expect(plan.removeIds).toEqual(['entry-arts']);
    expect(plan.upsert).toEqual([]);
  });

  it('ne touche pas une ligne inchangée', () => {
    const plan = planProgramme([entry('fr')], [row('fr')]);
    expect(plan.upsert).toEqual([]);
    expect(plan.removeIds).toEqual([]);
  });

  it('corrige le coefficient, le volume et le caractère facultatif', () => {
    const plan = planProgramme(
      [entry('fr'), entry('eps'), entry('lat')],
      [
        row('fr', { coefficient: 5 }),
        row('eps', { weeklyMinutes: 90 }),
        row('lat', { mandatory: false }),
      ],
    );
    expect(plan.added).toBe(0);
    expect(plan.upsert.map((u) => u.subjectId)).toEqual(['fr', 'eps', 'lat']);
    expect(planCounts(plan)).toEqual({ added: 0, changed: 3, removed: 0 });
  });

  it('ignore une matière décochée qui n’était pas au programme', () => {
    const plan = planProgramme([], [row('svt', { included: false })]);
    expect(plan.upsert).toEqual([]);
    expect(plan.removeIds).toEqual([]);
  });

  it('gère un envoi mêlant ajout, correction, retrait et statu quo', () => {
    const plan = planProgramme(
      [entry('fr'), entry('eps'), entry('arts')],
      [
        row('fr'), // inchangée
        row('eps', { coefficient: 1 }), // corrigée
        row('arts', { included: false }), // retirée
        row('svt', { coefficient: 3, weeklyMinutes: 180 }), // ajoutée
      ],
    );
    expect(planCounts(plan)).toEqual({ added: 1, changed: 1, removed: 1 });
  });

  it('ne compte qu’une fois une matière envoyée deux fois', () => {
    const plan = planProgramme([], [row('fr', { coefficient: 3 }), row('fr', { coefficient: 9 })]);
    expect(plan.upsert).toEqual([{ subjectId: 'fr', coefficient: 3, weeklyMinutes: 120, mandatory: true }]);
  });
});
