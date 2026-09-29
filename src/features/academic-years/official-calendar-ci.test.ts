import { describe, it, expect } from 'vitest';
import { OFFICIAL_CALENDARS_CI, officialCalendarFor } from './official-calendar-ci';

describe('Calendrier officiel 2026-2027', () => {
  const cal = OFFICIAL_CALENDARS_CI['2026-2027']!;

  it('reprend exactement les dates du ministère', () => {
    expect(cal.periods.map((p) => [p.startsOn, p.endsOn])).toEqual([
      ['2026-09-14', '2026-12-04'],
      ['2026-12-07', '2027-03-12'],
      ['2027-03-15', '2027-06-11'],
    ]);
    expect(cal.breaks.filter((b) => b.kind === 'VACATION').map((b) => [b.name, b.startsOn, b.endsOn])).toEqual([
      ['Congés de Toussaint', '2026-10-23', '2026-11-01'],
      ['Congés de Noël', '2026-12-18', '2027-01-03'],
      ['Congé de février', '2027-02-05', '2027-02-14'],
      ['Congés de Pâques', '2027-03-19', '2027-04-04'],
      ['Grandes vacances', '2027-07-30', '2027-09-12'],
    ]);
  });

  it('jours fériés : Ascension et lundi de Pentecôte d’après Pâques 2027 (28 mars)', () => {
    const paques = Date.UTC(2027, 2, 28);
    const plus = (days: number) => new Date(paques + days * 86_400_000).toISOString().slice(0, 10);
    const ferie = (name: string) => cal.breaks.find((b) => b.name === name)!;
    expect(ferie('Ascension').startsOn).toBe(plus(39));
    expect(ferie('Lundi de Pentecôte').startsOn).toBe(plus(50));
    expect(new Date(`${ferie('Ascension').startsOn}T12:00:00Z`).getUTCDay()).toBe(4); // jeudi
    expect(new Date(`${ferie('Lundi de Pentecôte').startsOn}T12:00:00Z`).getUTCDay()).toBe(1); // lundi
  });

  it('chaque jour férié tombe pendant un trimestre, hors congés', () => {
    for (const f of cal.breaks.filter((b) => b.kind === 'PUBLIC_HOLIDAY')) {
      expect(cal.periods.some((p) => f.startsOn >= p.startsOn && f.endsOn <= p.endsOn), f.name).toBe(true);
      expect(cal.breaks.some((b) => b.kind === 'VACATION' && f.startsOn >= b.startsOn && f.startsOn <= b.endsOn), f.name).toBe(false);
    }
  });

  it('les trimestres se suivent sans se chevaucher', () => {
    for (let i = 1; i < cal.periods.length; i++) {
      expect(cal.periods[i]!.startsOn > cal.periods[i - 1]!.endsOn).toBe(true);
    }
    for (const p of [...cal.periods, ...cal.breaks]) expect(p.endsOn >= p.startsOn).toBe(true);
  });

  it('deux semestres pour le technique et le professionnel, dans l’année', () => {
    expect(cal.semesters.map((s) => [s.name, s.startsOn, s.endsOn])).toEqual([
      ['1er semestre', '2026-09-14', '2027-01-22'],
      ['2e semestre', '2027-01-25', '2027-05-28'],
    ]);
    // Rentrée commune avec le général, mais fin d'année plus tôt.
    expect(cal.semesters[0]!.startsOn).toBe(cal.periods[0]!.startsOn);
    expect(cal.semesters[1]!.endsOn < cal.periods[2]!.endsOn).toBe(true);
    expect(cal.semesters[1]!.startsOn > cal.semesters[0]!.endsOn).toBe(true);
  });

  it('le technique a ses propres congés, différents de ceux du général', () => {
    const nom = (list: typeof cal.breaks, n: string) => list.find((b) => b.name === n)!;
    expect(nom(cal.technicalBreaks, 'Congés de Toussaint').startsOn).toBe('2026-10-27');
    expect(nom(cal.breaks, 'Congés de Toussaint').startsOn).toBe('2026-10-23');
    expect(nom(cal.technicalBreaks, 'Grandes vacances').startsOn).toBe('2027-07-16');
    expect(nom(cal.breaks, 'Grandes vacances').startsOn).toBe('2027-07-30');
    // Leur congé de février tombe à l'intérieur du 2e semestre, pas entre les deux.
    const fevrier = nom(cal.technicalBreaks, 'Congé de février');
    expect(fevrier.startsOn > cal.semesters[1]!.startsOn).toBe(true);
    expect(fevrier.endsOn < cal.semesters[1]!.endsOn).toBe(true);
    for (const b of cal.technicalBreaks) expect(b.endsOn >= b.startsOn).toBe(true);
  });

  it('se retrouve par le nom de l’année, même écrit autrement', () => {
    expect(officialCalendarFor('2026-2027')).toBe(cal);
    expect(officialCalendarFor('2026 - 2027')).toBe(cal);
    expect(officialCalendarFor('2026/2027')).toBe(cal);
    expect(officialCalendarFor('2030-2031')).toBeNull();
  });
});
