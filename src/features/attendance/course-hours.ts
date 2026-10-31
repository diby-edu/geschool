/**
 * L'appel heure par heure (0170, maquette docs/maquettes/appel-par-heure.html).
 *
 * Un cours de N heures se découpe à parts égales entre son début et sa fin —
 * même règle que la base (app.occurrence_hour_at) : un cours de 14 h à 17 h a
 * trois heures, 14-15, 15-16, 16-17. Fonctions pures, testées sans base.
 */

export type CourseHour = { hour: number; startsIso: string; endsIso: string };

/** Les heures d'un cours, dans l'ordre. */
export function courseHours(startsIso: string, endsIso: string, count: number): CourseHour[] {
  const s = Date.parse(startsIso);
  const e = Date.parse(endsIso);
  const n = Math.max(1, Math.floor(count) || 1);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [{ hour: 1, startsIso, endsIso }];
  const step = (e - s) / n;
  return Array.from({ length: n }, (_, i) => ({
    hour: i + 1,
    startsIso: new Date(s + step * i).toISOString(),
    endsIso: new Date(i === n - 1 ? e : s + step * (i + 1)).toISOString(),
  }));
}

/** L'heure (1, 2, 3…) qui couvre cet instant ; null avant ou après le cours. */
export function hourAt(startsIso: string, endsIso: string, count: number, at: number): number | null {
  const s = Date.parse(startsIso);
  const e = Date.parse(endsIso);
  const n = Math.max(1, Math.floor(count) || 1);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || at < s || at >= e) return null;
  return Math.min(n, 1 + Math.floor((at - s) / ((e - s) / n)));
}

/**
 * Qui est absent à l'heure `hour`, à l'ouverture de l'écran : l'appel de cette
 * heure s'il est fait ; sinon les absents de l'heure d'avant (« la liste reprend
 * les absents de 14 h ») ; à la 1re heure, personne.
 */
export function absentAtOpening(absentHours: readonly number[], hour: number, hourTaken: boolean): boolean {
  if (hourTaken) return absentHours.includes(hour);
  return hour > 1 && absentHours.includes(hour - 1);
}

/** Les heures d'absence d'un élève après l'appel de l'heure `hour`. */
export function mergeAbsentHours(previous: readonly number[], hour: number, absent: boolean): number[] {
  const kept = previous.filter((h) => h !== hour);
  return (absent ? [...kept, hour] : kept).sort((a, b) => a - b);
}
