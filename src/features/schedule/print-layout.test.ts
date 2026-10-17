import { describe, expect, it } from 'vitest';
import { colorsFor, layoutTimetable, type Band, type PrintItem } from './print-layout';

const DAYS = [1, 2];
// Grille : 07:30-08:25, 08:25-09:20, récréation 09:20-09:40, 09:40-10:35 ; le mardi n'a pas de 4e créneau.
const bands: Band[] = [
  ...DAYS.flatMap((d) => [
    { day: d, start: '07:30:00', end: '08:25:00', kind: 'TEACHING' as const },
    { day: d, start: '08:25:00', end: '09:20:00', kind: 'TEACHING' as const },
    { day: d, start: '09:20:00', end: '09:40:00', kind: 'PAUSE' as const, label: 'Récréation' },
  ]),
  { day: 1, start: '09:40:00', end: '10:35:00', kind: 'TEACHING' },
];
const item = (day: number, start: string, end: string, title: string): PrintItem => ({ day, start, end, title, lines: [], colorKey: title });

describe('layoutTimetable', () => {
  it('une ligne par créneau, dans l’ordre de la journée, pauses comprises', () => {
    const l = layoutTimetable(DAYS, bands, []);
    expect(l.rows.map((r) => `${r.start}-${r.end}:${r.kind}`)).toEqual([
      '07:30-08:25:TEACHING',
      '08:25-09:20:TEACHING',
      '09:20-09:40:PAUSE',
      '09:40-10:35:TEACHING',
    ]);
    expect(l.cells[2]![0]).toEqual({ type: 'pause', label: 'Récréation' });
  });

  it('un jour sans ce créneau le montre absent (grisé), pas vide', () => {
    const l = layoutTimetable(DAYS, bands, []);
    expect(l.cells[3]![0]).toEqual({ type: 'empty' });
    expect(l.cells[3]![1]).toEqual({ type: 'none' });
  });

  it('un cours de 2 h occupe deux lignes et compte 2 h', () => {
    const l = layoutTimetable(DAYS, bands, [item(1, '07:30:00', '09:20:00', 'Maths')]);
    expect(l.cells[0]![0]).toMatchObject({ type: 'items', rowSpan: 2 });
    expect(l.cells[1]![0]).toEqual({ type: 'covered' });
    expect(l.volume).toEqual([{ key: 'Maths', hours: 2 }]);
    expect(l.totalHours).toBe(2);
  });

  it('un cours ne traverse jamais une pause', () => {
    const l = layoutTimetable(DAYS, bands, [item(1, '08:25:00', '10:35:00', 'Long')]);
    expect(l.cells[1]![0]).toMatchObject({ type: 'items', rowSpan: 1 });
    expect(l.cells[2]![0]).toEqual({ type: 'pause', label: 'Récréation' });
  });

  it('1 cours = 1 heure, quelle que soit la durée du créneau (55 min)', () => {
    const l = layoutTimetable(DAYS, bands, [item(1, '07:30:00', '08:25:00', 'Français'), item(2, '07:30:00', '08:25:00', 'Français')]);
    expect(l.volume).toEqual([{ key: 'Français', hours: 2 }]);
  });

  it('deux cours au même moment restent tous deux visibles', () => {
    const l = layoutTimetable(DAYS, bands, [item(1, '07:30:00', '08:25:00', 'A'), item(1, '07:30:00', '08:25:00', 'B')]);
    const c = l.cells[0]![0]!;
    expect(c.type === 'items' && c.items.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('un cours hors grille (heure changée à la main) garde sa propre ligne', () => {
    const l = layoutTimetable(DAYS, bands, [item(2, '14:00:00', '15:00:00', 'Club')]);
    expect(l.rows.at(-1)).toMatchObject({ start: '14:00', end: '15:00' });
    expect(l.cells.at(-1)![1]).toMatchObject({ type: 'items' });
  });
});

describe('colorsFor', () => {
  it('stable : même clé, même couleur, quel que soit l’ordre', () => {
    const a = colorsFor(['SVT', 'Maths', 'Anglais']);
    const b = colorsFor(['Anglais', 'SVT', 'Maths']);
    expect(a.get('Maths')).toEqual(b.get('Maths'));
  });
});
