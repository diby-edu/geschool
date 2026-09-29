import { describe, expect, it } from 'vitest';
import { addDays, currentPeriod, mondayOf, resolveRange, schoolToday, type PeriodInfo } from './time';

const periods: PeriodInfo[] = [
  { id: 'p1', name: 'Trimestre 1', sequence: 1, kind: 'TERM', starts_on: '2026-09-02', ends_on: '2026-12-18' },
  { id: 'p2', name: 'Trimestre 2', sequence: 2, kind: 'TERM', starts_on: '2027-01-05', ends_on: '2027-03-26' },
  { id: 'p3', name: 'Trimestre 3', sequence: 3, kind: 'TERM', starts_on: '2027-04-06', ends_on: '2027-06-25' },
];
const year = { starts_on: '2026-09-02', ends_on: '2027-06-25' };

describe('schoolToday', () => {
  it('donne la date du fuseau de l’ecole, pas celle d’UTC', () => {
    const late = new Date('2026-12-10T23:30:00Z'); // 23 h 30 UTC = déjà le 11 à Auckland
    expect(schoolToday('UTC', late)).toBe('2026-12-10');
    expect(schoolToday('Pacific/Auckland', late)).toBe('2026-12-11');
  });
  it('retombe sur UTC si le fuseau est inconnu', () => {
    expect(schoolToday('Nulle/Part', new Date('2026-12-10T10:00:00Z'))).toBe('2026-12-10');
  });
});

describe('dates', () => {
  it('addDays traverse les mois et les années', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('mondayOf : lundi de la semaine (dimanche compris dans la semaine qui finit)', () => {
    expect(mondayOf('2026-12-10')).toBe('2026-12-07'); // jeudi
    expect(mondayOf('2026-12-07')).toBe('2026-12-07'); // lundi
    expect(mondayOf('2026-12-13')).toBe('2026-12-07'); // dimanche
  });
});

describe('resolveRange', () => {
  const today = '2026-12-10';
  it('jour, semaine, mois, 7 jours', () => {
    expect(resolveRange('d', today, periods, year)).toEqual({ from: today, to: today });
    expect(resolveRange('w', today, periods, year)).toEqual({ from: '2026-12-07', to: today });
    expect(resolveRange('m', today, periods, year)).toEqual({ from: '2026-12-01', to: today });
    expect(resolveRange('w7', today, periods, year)).toEqual({ from: '2026-12-04', to: today });
  });
  it('periode en cours et année : plafonnées à aujourd’hui', () => {
    expect(resolveRange('t', today, periods, year)).toEqual({ from: '2026-09-02', to: today });
    expect(resolveRange('y', today, periods, year)).toEqual({ from: '2026-09-02', to: today });
  });
  it('une periode terminee garde sa vraie fin', () => {
    expect(resolveRange('t1', '2027-02-01', periods, year)).toEqual({ from: '2026-09-02', to: '2026-12-18' });
  });
  it('une periode pas encore commencee n’a pas de plage (le sélecteur la désactive)', () => {
    expect(resolveRange('t2', today, periods, year)).toBeNull();
    expect(resolveRange('t3', today, periods, year)).toBeNull();
  });
  it('sans periode configurée : null, jamais une plage inventée', () => {
    expect(resolveRange('t', today, [], null)).toBeNull();
    expect(resolveRange('t1', today, [], null)).toBeNull();
    expect(resolveRange('y', today, periods, null)).toBeNull();
  });
});

describe('currentPeriod', () => {
  it('prend la derniere periode commencee, sinon la premiere', () => {
    expect(currentPeriod(periods, '2027-02-01')?.id).toBe('p2');
    expect(currentPeriod(periods, '2026-08-01')?.id).toBe('p1');
    expect(currentPeriod([], '2026-08-01')).toBeNull();
  });
});
