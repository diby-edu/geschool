/**
 * Grille d'une journée de classe : matin, pause déjeuner, après-midi, et les
 * récréations. Fonctions pures (day-grid.test.ts), partagées par la génération
 * des créneaux (config.ts) et la relecture d'une grille existante (formulaire).
 *
 * Une journée = un matin [start ; lunchStart] et, s'il y a cours l'après-midi,
 * un après-midi [lunchEnd ; end]. Sans après-midi : [start ; end], pas de pause
 * déjeuner. Les récréations sont communes à tous les jours (même heure) ; une
 * récréation qui ne tient pas entièrement dans le matin ou l'après-midi d'un jour
 * est ignorée ce jour-là (un mercredi sans après-midi n'a pas la récréation de 15 h).
 */

export type DayPlan = { day: number; start: string; end: string; lunchStart?: string | undefined; lunchEnd?: string | undefined };
export type Pause = { start: string; end: string; label: string };
export type GridSlot = { position: number; start: string; end: string; kind: 'TEACHING' | 'BREAK' | 'LUNCH'; label: string | null };

export const LUNCH_LABEL = 'Pause déjeuner';

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function toTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

type Range = { start: number; end: number };

/** La journée a-t-elle un après-midi (pause déjeuner valide dans la journée) ? */
export function lunchOf(plan: DayPlan): Range | null {
  if (!plan.lunchStart || !plan.lunchEnd) return null;
  const r = { start: toMinutes(plan.lunchStart), end: toMinutes(plan.lunchEnd) };
  const day = { start: toMinutes(plan.start), end: toMinutes(plan.end) };
  return r.end > r.start && r.start > day.start && r.end < day.end ? r : null;
}

/** Créneaux d'une journée : cours découpés en créneaux de `slotMinutes`, pauses intercalées. */
export function buildDaySlots(plan: DayPlan, breaks: readonly Pause[], slotMinutes: number): GridSlot[] {
  const dayStart = toMinutes(plan.start);
  const dayEnd = toMinutes(plan.end);
  const lunch = lunchOf(plan);
  const halves: Range[] = lunch ? [{ start: dayStart, end: lunch.start }, { start: lunch.end, end: dayEnd }] : [{ start: dayStart, end: dayEnd }];

  const recesses = breaks
    .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end), label: b.label }))
    .filter((b) => b.end > b.start && halves.some((h) => b.start >= h.start && b.end <= h.end));

  type Seg = Range & { kind: GridSlot['kind']; label: string | null };
  const segs: Seg[] = [];
  for (const half of halves) {
    const inside = recesses.filter((b) => b.start >= half.start && b.end <= half.end).sort((a, b) => a.start - b.start);
    let cursor = half.start;
    for (const b of inside) {
      if (b.start > cursor) segs.push({ start: cursor, end: b.start, kind: 'TEACHING', label: null });
      segs.push({ start: b.start, end: b.end, kind: 'BREAK', label: b.label });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < half.end) segs.push({ start: cursor, end: half.end, kind: 'TEACHING', label: null });
  }
  if (lunch) segs.push({ ...lunch, kind: 'LUNCH', label: LUNCH_LABEL });
  segs.sort((a, b) => a.start - b.start);

  const slots: GridSlot[] = [];
  for (const seg of segs) {
    if (seg.kind !== 'TEACHING') {
      slots.push({ position: slots.length, start: toTime(seg.start), end: toTime(seg.end), kind: seg.kind, label: seg.label });
      continue;
    }
    // Un reste plus court qu'un créneau ne devient pas un cours.
    for (let t = seg.start; t + slotMinutes <= seg.end; t += slotMinutes) {
      slots.push({ position: slots.length, start: toTime(t), end: toTime(t + slotMinutes), kind: 'TEACHING', label: null });
    }
  }
  return slots;
}

export type StoredSlot = { day_of_week: number; starts_at: string; ends_at: string; kind: string; label: string | null };

/** Ancienne grille : la pause déjeuner était une pause ordinaire, reconnue à son nom. */
const LEGACY_LUNCH = /d[ée]jeuner|midi/i;
const isLunch = (s: StoredSlot) => s.kind === 'LUNCH' || (s.kind !== 'TEACHING' && LEGACY_LUNCH.test(s.label ?? ''));

/** Relit une grille enregistrée : horaire de chaque jour (matin / après-midi) et récréations. */
export function readDayPlans(rows: readonly StoredSlot[]): { dayHours: DayPlan[]; breaks: Pause[] } {
  const hhmm = (t: string) => t.slice(0, 5);
  const days = new Map<number, { start: string; end: string; lunch: StoredSlot | null }>();
  for (const r of rows) {
    const cur = days.get(r.day_of_week) ?? { start: '99:99', end: '00:00', lunch: null };
    if (r.kind === 'TEACHING') {
      if (hhmm(r.starts_at) < cur.start) cur.start = hhmm(r.starts_at);
      if (hhmm(r.ends_at) > cur.end) cur.end = hhmm(r.ends_at);
    } else if (isLunch(r)) {
      cur.lunch = r;
    }
    days.set(r.day_of_week, cur);
  }
  const dayHours: DayPlan[] = [...days.entries()]
    .filter(([, d]) => d.start !== '99:99')
    .map(([day, d]) => ({
      day,
      start: d.start,
      end: d.end,
      ...(d.lunch && hhmm(d.lunch.starts_at) > d.start && hhmm(d.lunch.ends_at) < d.end
        ? { lunchStart: hhmm(d.lunch.starts_at), lunchEnd: hhmm(d.lunch.ends_at) }
        : {}),
    }))
    .sort((a, b) => a.day - b.day);

  const seen = new Map<string, Pause>();
  for (const r of rows) {
    if (r.kind === 'TEACHING' || isLunch(r)) continue;
    const key = `${hhmm(r.starts_at)}-${hhmm(r.ends_at)}`;
    if (!seen.has(key)) seen.set(key, { start: hhmm(r.starts_at), end: hhmm(r.ends_at), label: r.label ?? 'Récréation' });
  }
  return { dayHours, breaks: [...seen.values()].sort((a, b) => a.start.localeCompare(b.start)) };
}

const DAY_NAMES = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « lundi au vendredi », « lundi, mardi et jeudi »… */
export function daysLabel(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (sorted.length > 2 && consecutive) return `${DAY_NAMES[sorted[0]!]} au ${DAY_NAMES[sorted[sorted.length - 1]!]}`;
  const names = sorted.map((d) => DAY_NAMES[d]!);
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export type GridGroup = { days: number[]; morning: string; afternoon: string | null };

/** Jours qui ont le MÊME horaire, regroupés — « lundi au vendredi : 07:30–12:20 puis 13:10–16:50 ». */
export function groupDays(dayHours: readonly DayPlan[]): GridGroup[] {
  const groups = new Map<string, GridGroup>();
  for (const h of [...dayHours].sort((a, b) => a.day - b.day)) {
    const lunch = lunchOf(h);
    const morning = `${h.start}–${lunch ? h.lunchStart : h.end}`;
    const afternoon = lunch ? `${h.lunchEnd}–${h.end}` : null;
    const key = `${morning}|${afternoon ?? ''}`;
    const found = groups.get(key);
    if (found) found.days.push(h.day);
    else groups.set(key, { days: [h.day], morning, afternoon });
  }
  return [...groups.values()];
}

/** Pause déjeuner de la grille (la même pour les jours qui en ont une), pour l'afficher. */
export function lunchLabel(dayHours: readonly DayPlan[]): string | null {
  const lunches = new Set(dayHours.filter((h) => lunchOf(h)).map((h) => `${h.lunchStart}–${h.lunchEnd}`));
  if (lunches.size === 0) return null;
  return [...lunches].join(' ou ');
}
