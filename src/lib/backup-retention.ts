/**
 * Quelles copies garder (page Technique, sauvegardes) : les 7 dernières, plus la
 * plus récente de chacune des 4 dernières semaines et de chacun des 6 derniers
 * mois. Au total 17 copies au plus, soit environ 6 mois d'historique pour
 * quelques centaines de Mo. Pur, testé dans backup-retention.test.ts.
 */

export const RETENTION = { daily: 7, weekly: 4, monthly: 6 } as const;

/** « geschool-20261028-0200.dump » → sa date (UTC), ou null si le nom ne suit pas le modèle. */
export function backupDate(name: string): Date | null {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lundi (UTC) de la semaine d'une date : la clé d'une semaine. */
function weekKey(d: Date): string {
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/** Les noms à garder, parmi tous ceux présents. Un nom illisible est toujours gardé (on n'efface pas ce qu'on ne comprend pas). */
export function backupsToKeep(names: string[], r: { daily: number; weekly: number; monthly: number } = RETENTION): Set<string> {
  const dated = names
    .map((n) => ({ n, d: backupDate(n) }))
    .filter((x): x is { n: string; d: Date } => x.d !== null)
    .sort((a, b) => b.d.getTime() - a.d.getTime());
  const keep = new Set<string>(names.filter((n) => backupDate(n) === null));
  for (const x of dated.slice(0, r.daily)) keep.add(x.n);

  const pick = (key: (d: Date) => string, count: number) => {
    const seen = new Set<string>();
    for (const x of dated) {
      const k = key(x.d);
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > count) break;
      keep.add(x.n);
    }
  };
  pick(weekKey, r.weekly);
  pick((d) => d.toISOString().slice(0, 7), r.monthly);
  return keep;
}
