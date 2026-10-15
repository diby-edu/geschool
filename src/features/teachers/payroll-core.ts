/**
 * Paie à l'heure des enseignants (règles du 2026-10-15). Module pur.
 *
 *  - 1 cours = 1 heure ; une heure FAITE est un cours dont l'appel a été fait.
 *  - Vacataire : toutes ses heures faites sont payées à son taux horaire.
 *  - Permanent : un quota par semaine (le maximum de son service, 16 h, 18 h…).
 *    Au-delà, SEMAINE PAR SEMAINE, ce sont des heures supplémentaires, payées
 *    au taux des heures supplémentaires. Une heure supplémentaire est datée du
 *    jour du cours qui dépasse le quota : une semaine à cheval sur deux mois
 *    paie chaque heure dans le bon mois.
 */

export type PayKind = 'HOURLY' | 'PERMANENT';

export type Course = {
  /** Jour du cours, AAAA-MM-JJ. */
  date: string;
  /** Instant de début (pour l'ordre dans la semaine). */
  startsAt: string;
  /** Heures de cours (1 par créneau). */
  hours: number;
  /** Appel fait = cours attesté. */
  done: boolean;
};

export type WeekLine = { weekStart: string; hours: number; overtime: number };

export type PayResult = {
  /** Heures faites (appel fait) dans la période. */
  doneHours: number;
  /** Cours passés sans appel dans la période : non payés, à vérifier. */
  unattestedHours: number;
  /** Heures payées : toutes pour un vacataire, les supplémentaires pour un permanent. */
  payableHours: number;
  amount: number;
  /** Détail semaine par semaine (permanent). */
  weeks: WeekLine[];
  /** Permanent sans quota connu : impossible de compter les heures supplémentaires. */
  missingQuota: boolean;
};

/** Le lundi de la semaine d'un jour (AAAA-MM-JJ). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Paie d'un enseignant sur [from, to]. `courses` doit couvrir aussi le début
 * de la première semaine (depuis son lundi) : sans ces jours, les heures du
 * début de semaine ne compteraient pas dans le quota.
 */
export function computePay(
  courses: readonly Course[],
  kind: PayKind,
  quotaHours: number | null,
  rate: number,
  from: string,
  to: string,
): PayResult {
  const inPeriod = (d: string) => d >= from && d <= to;
  const done = courses.filter((c) => c.done);
  const doneHours = done.filter((c) => inPeriod(c.date)).reduce((a, c) => a + c.hours, 0);
  const unattestedHours = courses.filter((c) => !c.done && inPeriod(c.date)).reduce((a, c) => a + c.hours, 0);

  if (kind === 'HOURLY') {
    return { doneHours, unattestedHours, payableHours: doneHours, amount: round2(doneHours * rate), weeks: [], missingQuota: false };
  }

  if (quotaHours === null) {
    return { doneHours, unattestedHours, payableHours: 0, amount: 0, weeks: [], missingQuota: true };
  }

  const byWeek = new Map<string, Course[]>();
  for (const c of [...done].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const w = weekStart(c.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), c]);
  }
  let overtime = 0;
  const weeks: WeekLine[] = [];
  for (const [w, list] of [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let cum = 0;
    let weekHours = 0;
    let weekOvertime = 0;
    for (const c of list) {
      const before = cum;
      cum += c.hours;
      const extra = Math.max(0, cum - Math.max(quotaHours, before));
      if (inPeriod(c.date)) {
        weekHours += c.hours;
        weekOvertime += extra;
      }
    }
    if (weekHours > 0) weeks.push({ weekStart: w, hours: weekHours, overtime: weekOvertime });
    overtime += weekOvertime;
  }
  return { doneHours, unattestedHours, payableHours: overtime, amount: round2(overtime * rate), weeks, missingQuota: false };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** « 36 000 F » */
export function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
}
