/**
 * Horaires d'une séance datée. Les séances portent des instants complets
 * (timestamptz, « 2026-10-13T10:20:00+00:00 ») : on compare des instants, jamais
 * des chaînes « HH:MM », et l'heure affichée est celle du FUSEAU DE L'ÉTABLISSEMENT.
 * Fonctions pures, testées sans base (day-phase.test.ts).
 */

export type SessionPhase = 'done' | 'missed' | 'ongoing' | 'upcoming';

const MINUTE = 60_000;

/** Le créneau couvre-t-il cet instant, avec une marge avant le début et après la fin ? */
export function coversNow(startsIso: string, endsIso: string, now: Date, graceMinutes = 0): boolean {
  const t = now.getTime();
  return t >= Date.parse(startsIso) - graceMinutes * MINUTE && t <= Date.parse(endsIso) + graceMinutes * MINUTE;
}

/** État d'une séance à cet instant : terminée (appel fait ou non), en cours, à venir. */
export function sessionPhase(startsIso: string, endsIso: string, called: boolean, now: Date): SessionPhase {
  const t = now.getTime();
  if (t < Date.parse(startsIso)) return 'upcoming';
  if (t < Date.parse(endsIso)) return 'ongoing';
  return called ? 'done' : 'missed';
}

/** « 08:30 » dans le fuseau donné (UTC si le fuseau est inconnu). */
export function clock(iso: string, timezone: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}
