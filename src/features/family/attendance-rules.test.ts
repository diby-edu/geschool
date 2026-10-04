import { describe, it, expect } from 'vitest';
import { debutFenetre, isJustified, parseFenetre, summarize, type Cover } from './attendance-rules';

const approuve: Cover = { from: '2026-10-01', to: '2026-10-03', status: 'APPROVED' };
const enAttente: Cover = { from: '2026-11-02', to: '2026-11-02', status: 'PENDING' };
const refuse: Cover = { from: '2026-12-05', to: '2026-12-05', status: 'REJECTED' };
const covers = [approuve, enAttente, refuse];

describe('absence justifiee', () => {
  it('une absence excusee a l’appel l’est d’emblee', () => {
    expect(isJustified('2026-09-15', 'EXCUSED', [])).toBe(true);
  });

  it('un justificatif approuve couvre toute sa plage, bornes comprises', () => {
    expect(isJustified('2026-10-01', 'ABSENT', covers)).toBe(true);
    expect(isJustified('2026-10-02', 'ABSENT', covers)).toBe(true);
    expect(isJustified('2026-10-03', 'ABSENT', covers)).toBe(true);
    expect(isJustified('2026-10-04', 'ABSENT', covers)).toBe(false);
  });

  it('en attente ou refuse ne justifie rien — la decision n’est pas prise', () => {
    expect(isJustified('2026-11-02', 'ABSENT', covers)).toBe(false);
    expect(isJustified('2026-12-05', 'ABSENT', covers)).toBe(false);
  });

  it('un retard n’est jamais justifie, meme dans une plage approuvee', () => {
    expect(isJustified('2026-10-02', 'LATE', covers)).toBe(false);
  });
});

describe('totaux affiches', () => {
  it('separent absences et retards, et cumulent les minutes', () => {
    const t = summarize([
      { date: '2026-10-01', status: 'ABSENT', minutesLate: 0, justified: true },
      { date: '2026-10-08', status: 'ABSENT', minutesLate: 0, justified: false },
      { date: '2026-10-09', status: 'EXCUSED', minutesLate: 0, justified: true },
      { date: '2026-10-10', status: 'LATE', minutesLate: 15, justified: false },
      { date: '2026-10-11', status: 'LATE', minutesLate: 5, justified: false },
    ]);
    expect(t).toEqual({ absences: 3, justifiees: 2, retards: 2, minutesLate: 20 });
  });

  it('rien a compter', () => {
    expect(summarize([])).toEqual({ absences: 0, justifiees: 0, retards: 0, minutesLate: 0 });
  });
});

describe('fenetre de consultation', () => {
  it('30 jours par defaut, y compris sur une valeur inventee', () => {
    expect(parseFenetre(undefined)).toBe('30');
    expect(parseFenetre('toujours')).toBe('30');
    expect(parseFenetre('90')).toBe('90');
    expect(parseFenetre('annee')).toBe('annee');
  });

  it('compte les jours en arriere, changement de mois compris', () => {
    expect(debutFenetre('30', '2026-10-04', null)).toBe('2026-09-04');
    expect(debutFenetre('90', '2026-10-04', null)).toBe('2026-07-06');
  });

  it('« toute l’annee » part de la rentree quand on la connait', () => {
    expect(debutFenetre('annee', '2027-03-01', '2026-09-07')).toBe('2026-09-07');
    expect(debutFenetre('annee', '2027-03-01', null)).toBe('0001-01-01');
  });
});
