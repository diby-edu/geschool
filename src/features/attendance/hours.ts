/**
 * « 6 h », « 4 h 30 », « 0 h » : des heures décimales (4.5) écrites comme on
 * les lit sur un bulletin. Arrondi à la minute.
 */
export function formatHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
