import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Les chiffres de la plateforme, pour l'éditeur.
 *
 * Trois questions auxquelles ce module répond, et qu'aucun écran ne posait :
 * est-ce que ça grandit, est-ce que ça sert, et qui paie.
 *
 * Tout est compté EN BASE (migration 0130) : PostgREST plafonne chaque réponse
 * à 1 000 lignes, et lire les tables brutes pour compter en mémoire rendait des
 * chiffres faux dès la 1 001e ligne (5 600 élèves, 560 000 notes). Les trois
 * fonctions ne rendent qu'une ligne par école, par mois, ou une ligne de
 * totaux ; elles refusent tout autre compte qu'un administrateur de la
 * plateforme — c'est la base qui le garantit, pas cette fonction.
 */

export type MonthPoint = {
  /** « 2026-09 » */
  month: string;
  label: string;
  schools: number;
  students: number;
  revenue: number;
};

export type SchoolStat = {
  id: string;
  name: string;
  slug: string;
  status: string;
  students: number;
  staff: number;
  /** Dernier signe de vie : connexion, saisie, génération. */
  lastSeen: string | null;
  /** Jours depuis le dernier signe de vie. */
  idleDays: number | null;
  disabledModules: number;
};

export type PlatformStats = {
  months: MonthPoint[];
  schools: SchoolStat[];
  /** Écoles sans aucun signe de vie depuis plus de 30 jours. */
  dormant: number;
  /** Le total encaissé, et ce qui reste dû. */
  cashedIn: number;
  outstanding: number;
  currency: string;
  /** Combien d'écoles utilisent réellement chaque grand module. */
  moduleUse: { module: string; schools: number }[];
};

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Les tables dont la présence d'une ligne dit qu'une école se sert du module. */
const MODULES: { module: string; table: string }[] = [
  { module: 'Élèves', table: 'students' },
  { module: 'Emploi du temps', table: 'schedule_sessions' },
  { module: 'Présences', table: 'attendance_registers' },
  { module: 'Notes', table: 'grades' },
  { module: 'Bulletins', table: 'report_cards' },
  { module: 'Discipline', table: 'discipline_incidents' },
  { module: 'Annonces', table: 'announcements' },
];

type LigneEcole = {
  school_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  disabled_modules: number;
  students: number;
  staff: number;
  last_seen: string | null;
  modules_used: string[] | null;
};
type LigneMois = { month: string; schools: number; students: number; revenue: number | string };
type LigneTotaux = { cashed_in: number | string; outstanding: number | string; currency: string | null };

export async function getPlatformStats(months = 12): Promise<PlatformStats> {
  const supabase = await createClient();
  const debut = new Date();
  debut.setMonth(debut.getMonth() - (months - 1));
  debut.setDate(1);
  debut.setHours(0, 0, 0, 0);
  const depuis = debut.toISOString();

  const [parEcole, parMois, totaux] = await Promise.all([
    supabase.rpc('platform_school_stats' as never, { p_since: depuis } as never),
    supabase.rpc('platform_monthly_stats' as never, { p_since: depuis } as never),
    supabase.rpc('platform_payment_totals' as never),
  ]);
  // Un échec doit se voir : des zéros silencieux sont exactement le défaut
  // que ces fonctions corrigent.
  for (const r of [parEcole, parMois, totaux]) if (r.error) throw new Error(r.error.message);

  const ecoles = (parEcole.data ?? []) as unknown as LigneEcole[];

  // --- Évolution mois par mois ---------------------------------------------
  const cases = new Map<string, MonthPoint>();
  for (let i = 0; i < months; i++) {
    const d = new Date(debut);
    d.setMonth(debut.getMonth() + i);
    const clef = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    cases.set(clef, { month: clef, label: `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, schools: 0, students: 0, revenue: 0 });
  }
  for (const m of (parMois.data ?? []) as unknown as LigneMois[]) {
    const c = cases.get(m.month);
    if (!c) continue;
    c.schools = m.schools;
    c.students = m.students;
    c.revenue = Number(m.revenue) || 0;
  }

  const t = ((totaux.data ?? []) as unknown as LigneTotaux[])[0];
  const cashedIn = Number(t?.cashed_in) || 0;
  const outstanding = Number(t?.outstanding) || 0;
  const currency = t?.currency ?? 'XOF';

  // --- Par établissement ----------------------------------------------------
  const maintenant = Date.now();
  const schools: SchoolStat[] = ecoles
    .map((e) => ({
      id: e.school_id,
      name: e.name,
      slug: e.slug,
      status: e.status,
      students: e.students,
      staff: e.staff,
      lastSeen: e.last_seen,
      idleDays: e.last_seen ? Math.floor((maintenant - new Date(e.last_seen).getTime()) / 86_400_000) : null,
      disabledModules: e.disabled_modules,
    }))
    .sort((a, b) => b.students - a.students);

  // Une école qu'on n'a pas vue depuis un mois est en train de partir : c'est
  // l'indicateur le plus utile, et personne ne l'affichait.
  const dormant = schools.filter((s) => s.status === 'ACTIVE' && (s.idleDays === null || s.idleDays > 30)).length;

  // --- Qui se sert de quoi --------------------------------------------------
  // On ne regarde pas ce qui est activé — tout l'est par défaut — mais ce qui a
  // produit des données. Un module vendu mais jamais utilisé est un module
  // qu'on ne saura pas défendre au renouvellement.
  const moduleUse = MODULES.map((m) => ({
    module: m.module,
    schools: ecoles.filter((e) => (e.modules_used ?? []).includes(m.table)).length,
  })).sort((a, b) => b.schools - a.schools);

  return { months: [...cases.values()], schools, dormant, cashedIn, outstanding, currency, moduleUse };
}
