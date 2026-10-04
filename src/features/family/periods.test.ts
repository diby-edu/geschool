import { describe, it, expect } from 'vitest';
import { pickPeriod } from './periods';

const trimestres = [
  { id: 't1', sequence: 1, starts_on: '2026-09-07', ends_on: '2026-12-18' },
  { id: 't2', sequence: 2, starts_on: '2027-01-05', ends_on: '2027-03-26' },
  { id: 't3', sequence: 3, starts_on: '2027-04-12', ends_on: '2027-07-03' },
];

describe('periode affichee a un parent', () => {
  it('celle qu’on vit', () => {
    expect(pickPeriod(trimestres, undefined, '2027-02-10')?.id).toBe('t2');
  });

  it('pendant les vacances, la derniere achevee — c’est la que sont les notes', () => {
    expect(pickPeriod(trimestres, undefined, '2026-12-28')?.id).toBe('t1');
    expect(pickPeriod(trimestres, undefined, '2027-03-30')?.id).toBe('t2');
  });

  it('avant la rentree, la premiere a venir', () => {
    expect(pickPeriod(trimestres, undefined, '2026-08-20')?.id).toBe('t1');
  });

  it('apres la fin de l’annee, la derniere', () => {
    expect(pickPeriod(trimestres, undefined, '2027-08-15')?.id).toBe('t3');
  });

  it('la periode demandee dans l’URL prime', () => {
    expect(pickPeriod(trimestres, 't3', '2026-10-01')?.id).toBe('t3');
  });

  it('une periode d’un autre decoupage est ignoree, pas une erreur', () => {
    // Un identifiant de semestre chez un eleve en trimestres : on retombe sur
    // la periode en cours plutot que d'afficher une page vide.
    expect(pickPeriod(trimestres, 's1', '2026-10-01')?.id).toBe('t1');
  });

  it('aucune periode : rien a montrer', () => {
    expect(pickPeriod([], undefined, '2026-10-01')).toBeNull();
  });

  it('une periode sans dates reste selectionnable', () => {
    const sansDates = [{ id: 'x', sequence: 1, starts_on: null, ends_on: null }];
    expect(pickPeriod(sansDates, undefined, '2026-10-01')?.id).toBe('x');
  });
});
