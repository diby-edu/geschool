/**
 * Croissance de la base (page Technique, lot C) : combien de Mo s'ajoutent par
 * jour, et quand la taille permise sera atteinte. Pur, testé dans growth.test.ts.
 */

export type Growth =
  | { ready: false; spanHours: number }
  | { ready: true; mbPerDay: number; daysLeft: number | null; reachOn: string | null };

/**
 * Pente entre le premier et le dernier relevé. Il faut au moins 24 h de recul :
 * en dessous, une saisie de notes d'une heure donnerait une projection absurde.
 */
export function dbGrowth(points: { t: string; bytes: number | null }[], limitBytes: number, now = new Date()): Growth {
  const pts = points.filter((p): p is { t: string; bytes: number } => p.bytes !== null && Number.isFinite(p.bytes));
  if (pts.length < 2) return { ready: false, spanHours: 0 };
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const hours = (new Date(last.t).getTime() - new Date(first.t).getTime()) / 3_600_000;
  if (hours < 24) return { ready: false, spanHours: Math.round(hours) };
  const perDay = ((last.bytes - first.bytes) / hours) * 24;
  const mbPerDay = Math.round((perDay / 1024 / 1024) * 10) / 10;
  if (perDay <= 0) return { ready: true, mbPerDay, daysLeft: null, reachOn: null };
  const daysLeft = Math.max(0, (limitBytes - last.bytes) / perDay);
  const reach = new Date(now.getTime() + daysLeft * 86_400_000);
  return { ready: true, mbPerDay, daysLeft: Math.round(daysLeft), reachOn: reach.toISOString().slice(0, 10) };
}

/** Masque un identifiant de connexion : on voit de qui il s'agit, sans l'exposer en entier. */
export function maskIdentifier(raw: string): string {
  const v = raw.trim();
  if (v.includes('@')) {
    const [user, domain] = v.split('@');
    return `${(user ?? '').slice(0, 1)}•••@${domain ?? ''}`;
  }
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 8) return `${digits.slice(0, 4)} •• •• ${digits.slice(-2)}`;
  return v.length > 3 ? `${v.slice(0, 2)}•••` : '•••';
}
