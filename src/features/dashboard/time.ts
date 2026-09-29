/**
 * Dates du tableau de bord, calculees dans le FUSEAU DE L'ETABLISSEMENT (jamais celui
 * du serveur ni du navigateur) : « aujourd'hui » et « cette semaine » doivent etre
 * ceux de l'ecole. Fonctions pures, testables sans base.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date du jour (AAAA-MM-JJ) dans le fuseau donne. */
export function schoolToday(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  } catch {
    // fuseau inconnu : on retombe sur UTC
  }
  return now.toISOString().slice(0, 10);
}

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Lundi de la semaine qui contient `iso` (semaine scolaire : lundi → dimanche). */
export function mondayOf(iso: string): string {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 = dimanche
  return addDays(iso, -((dow + 6) % 7));
}

export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export type PeriodInfo = { id: string; name: string; sequence: number; kind: 'TERM' | 'SEMESTER' | 'QUARTER'; starts_on: string; ends_on: string };
export type YearInfo = { starts_on: string; ends_on: string };

/** Cles de plage : jour, semaine, mois, periode n°1..3, annee ; « w7 » = 7 derniers jours, « t » = periode en cours. */
export type RangeKey = 'd' | 'w' | 'w7' | 'm' | 't' | 't1' | 't2' | 't3' | 'y';
export type DateRange = { from: string; to: string };

export function currentPeriod(periods: PeriodInfo[], today: string): PeriodInfo | null {
  const sorted = [...periods].sort((a, b) => a.sequence - b.sequence);
  const started = sorted.filter((p) => p.starts_on <= today);
  return started[started.length - 1] ?? sorted[0] ?? null;
}

/** Plage de dates (bornes incluses, jamais dans le futur) ; null si la periode n'a pas commence. */
export function resolveRange(key: RangeKey, today: string, periods: PeriodInfo[], year: YearInfo | null): DateRange | null {
  const cap = (from: string, to: string): DateRange | null => {
    if (from > today) return null;
    return { from, to: to < today ? to : today };
  };
  switch (key) {
    case 'd':
      return { from: today, to: today };
    case 'w':
      return { from: mondayOf(today), to: today };
    case 'w7':
      return { from: addDays(today, -6), to: today };
    case 'm':
      return { from: firstOfMonth(today), to: today };
    case 't': {
      const p = currentPeriod(periods, today);
      return p ? cap(p.starts_on, p.ends_on) : null;
    }
    case 't1':
    case 't2':
    case 't3': {
      const n = Number(key.slice(1));
      const p = [...periods].sort((a, b) => a.sequence - b.sequence)[n - 1];
      return p ? cap(p.starts_on, p.ends_on) : null;
    }
    case 'y':
      return year ? cap(year.starts_on, year.ends_on) : null;
  }
}

/** Libelle court d'une periode : « T1 », « S2 »… selon qu'il s'agit de trimestres ou de semestres. */
export function periodShortLabel(p: Pick<PeriodInfo, 'kind' | 'sequence'>): string {
  return `${p.kind === 'SEMESTER' ? 'S' : p.kind === 'QUARTER' ? 'Q' : 'T'}${p.sequence}`;
}
