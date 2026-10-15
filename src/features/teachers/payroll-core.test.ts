import { describe, expect, it } from 'vitest';
import { computePay, formatFcfa, weekStart, type Course } from './payroll-core';

const c = (date: string, hours: number, done = true, hour = '08'): Course => ({ date, startsAt: `${date}T${hour}:00:00Z`, hours, done });

describe('weekStart', () => {
  it('le lundi de la semaine', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02'); // mercredi -> lundi
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // dimanche -> lundi
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
  });
});

describe('computePay — vacataire', () => {
  it('toutes les heures faites, au taux horaire ; les cours sans appel ne sont pas payés', () => {
    const r = computePay([c('2026-11-03', 4), c('2026-11-05', 8), c('2026-11-06', 2, false)], 'HOURLY', null, 3000, '2026-11-01', '2026-11-30');
    expect(r.doneHours).toBe(12);
    expect(r.unattestedHours).toBe(2);
    expect(r.payableHours).toBe(12);
    expect(r.amount).toBe(36000);
  });
});

describe('computePay — permanent (quota 18 h par semaine)', () => {
  it('21 h dans la semaine : 3 heures supplémentaires', () => {
    const r = computePay([c('2026-11-02', 6), c('2026-11-03', 6), c('2026-11-04', 6), c('2026-11-05', 3)], 'PERMANENT', 18, 3000, '2026-11-01', '2026-11-30');
    expect(r.payableHours).toBe(3);
    expect(r.amount).toBe(9000);
    expect(r.weeks).toEqual([{ weekStart: '2026-11-02', hours: 21, overtime: 3 }]);
  });

  it('semaine par semaine : 21 h puis 15 h = 3 h supplémentaires (pas de compensation)', () => {
    const r = computePay(
      [c('2026-11-02', 21), c('2026-11-09', 15)],
      'PERMANENT', 18, 3000, '2026-11-01', '2026-11-30',
    );
    expect(r.payableHours).toBe(3);
  });

  it('semaine à cheval sur deux mois : chaque heure supplémentaire dans le mois de son cours', () => {
    // Semaine du lundi 30 novembre : 16 h en novembre (lun.), puis 6 h en décembre.
    const courses = [c('2026-11-30', 16), c('2026-12-01', 6)];
    expect(computePay(courses, 'PERMANENT', 18, 1000, '2026-11-01', '2026-11-30').payableHours).toBe(0);
    expect(computePay(courses, 'PERMANENT', 18, 1000, '2026-12-01', '2026-12-31').payableHours).toBe(4);
  });

  it('sans quota : les heures supplémentaires ne se calculent pas, et on le dit', () => {
    const r = computePay([c('2026-11-02', 20)], 'PERMANENT', null, 3000, '2026-11-01', '2026-11-30');
    expect(r.missingQuota).toBe(true);
    expect(r.amount).toBe(0);
  });
});

describe('formatFcfa', () => {
  it('36 000 F', () => expect(formatFcfa(36000)).toBe('36 000 F'));
});
