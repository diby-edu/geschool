import { describe, it, expect } from 'vitest';
import { buildDaySlots, daysLabel, groupDays, lunchLabel, readDayPlans, type StoredSlot } from './day-grid';

const recre = { start: '10:15', end: '10:30', label: 'Récréation' };
// L'exemple de l'établissement : matin 7 h 30 – 12 h 20, après-midi 13 h 10 – 16 h 50, créneaux de 55 min.
const lundi = { day: 1, start: '07:30', end: '16:50', lunchStart: '12:20', lunchEnd: '13:10' };

const summary = (slots: ReturnType<typeof buildDaySlots>) => slots.map((s) => `${s.kind === 'TEACHING' ? 'cours' : s.label} ${s.start}-${s.end}`);

describe('buildDaySlots', () => {
  it('matin et après-midi, récréation et pause déjeuner : aucun cours pendant les pauses', () => {
    expect(summary(buildDaySlots(lundi, [recre], 55))).toEqual([
      'cours 07:30-08:25',
      'cours 08:25-09:20',
      'cours 09:20-10:15',
      'Récréation 10:15-10:30',
      'cours 10:30-11:25',
      'cours 11:25-12:20',
      'Pause déjeuner 12:20-13:10',
      'cours 13:10-14:05',
      'cours 14:05-15:00',
      'cours 15:00-15:55',
      'cours 15:55-16:50',
    ]);
  });

  it('la pause déjeuner est un créneau à part (LUNCH), jamais un cours', () => {
    const lunch = buildDaySlots(lundi, [recre], 55).filter((s) => s.kind === 'LUNCH');
    expect(lunch).toEqual([{ position: 6, start: '12:20', end: '13:10', kind: 'LUNCH', label: 'Pause déjeuner' }]);
  });

  it('sans après-midi : le matin seul, sans pause déjeuner', () => {
    const mercredi = { day: 3, start: '07:30', end: '12:20' };
    const slots = buildDaySlots(mercredi, [recre, { start: '15:00', end: '15:10', label: 'Récréation de l’après-midi' }], 55);
    expect(slots.some((s) => s.kind === 'LUNCH')).toBe(false);
    expect(slots.filter((s) => s.kind === 'BREAK').map((s) => s.label)).toEqual(['Récréation']);
    expect(slots[slots.length - 1]!.end).toBe('12:20');
  });

  it('une récréation à cheval sur la pause déjeuner est ignorée', () => {
    const slots = buildDaySlots(lundi, [{ start: '12:00', end: '12:40', label: 'Mal placée' }], 55);
    expect(slots.some((s) => s.label === 'Mal placée')).toBe(false);
  });

  it('les positions se suivent', () => {
    const slots = buildDaySlots(lundi, [recre], 55);
    expect(slots.map((s) => s.position)).toEqual(slots.map((_, i) => i));
  });
});

describe('readDayPlans', () => {
  const stored = (day: number, slots: ReturnType<typeof buildDaySlots>): StoredSlot[] =>
    slots.map((s) => ({ day_of_week: day, starts_at: `${s.start}:00`, ends_at: `${s.end}:00`, kind: s.kind, label: s.label }));

  it('relit matin, après-midi et récréations d’une grille enregistrée', () => {
    const rows = [...stored(1, buildDaySlots(lundi, [recre], 55)), ...stored(3, buildDaySlots({ day: 3, start: '07:30', end: '12:20' }, [recre], 55))];
    expect(readDayPlans(rows)).toEqual({
      dayHours: [
        { day: 1, start: '07:30', end: '16:50', lunchStart: '12:20', lunchEnd: '13:10' },
        { day: 3, start: '07:30', end: '12:20' },
      ],
      breaks: [recre],
    });
  });

  it('reconnaît la pause déjeuner d’une ancienne grille (pause ordinaire nommée « Pause déjeuner »)', () => {
    const rows: StoredSlot[] = [
      { day_of_week: 1, starts_at: '07:30:00', ends_at: '12:20:00', kind: 'TEACHING', label: null },
      { day_of_week: 1, starts_at: '12:20:00', ends_at: '13:10:00', kind: 'BREAK', label: 'Pause déjeuner' },
      { day_of_week: 1, starts_at: '13:10:00', ends_at: '15:55:00', kind: 'TEACHING', label: null },
    ];
    expect(readDayPlans(rows)).toEqual({ dayHours: [{ day: 1, start: '07:30', end: '15:55', lunchStart: '12:20', lunchEnd: '13:10' }], breaks: [] });
  });
});

describe('Résumé d’une grille', () => {
  const lun = { day: 1, start: '07:30', end: '16:50', lunchStart: '12:20', lunchEnd: '13:10' };
  const mar = { ...lun, day: 2 };
  const mer = { day: 3, start: '07:30', end: '12:20' };

  it('regroupe les jours de même horaire', () => {
    expect(groupDays([lun, mar, mer])).toEqual([
      { days: [1, 2], morning: '07:30–12:20', afternoon: '13:10–16:50' },
      { days: [3], morning: '07:30–12:20', afternoon: null },
    ]);
  });

  it('nomme les jours en français', () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('lundi au vendredi');
    expect(daysLabel([1, 3])).toBe('lundi et mercredi');
    expect(daysLabel([3])).toBe('mercredi');
  });

  it('donne l’heure de la pause déjeuner', () => {
    expect(lunchLabel([lun, mar, mer])).toBe('12:20–13:10');
    expect(lunchLabel([mer])).toBeNull();
  });
});
