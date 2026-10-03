import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Les chiffres de la plateforme, pour l'éditeur.
 *
 * Trois questions auxquelles ce module répond, et qu'aucun écran ne posait :
 * est-ce que ça grandit, est-ce que ça sert, et qui paie.
 *
 * Tout passe par le client RLS : seul un administrateur de la plateforme voit
 * ces lignes, et c'est la base qui le garantit, pas cette fonction.
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

export async function getPlatformStats(months = 12): Promise<PlatformStats> {
  const supabase = await createClient();
  const debut = new Date();
  debut.setMonth(debut.getMonth() - (months - 1));
  debut.setDate(1);
  debut.setHours(0, 0, 0, 0);
  const depuis = debut.toISOString();

  const [{ data: ecoles }, { data: eleves }, { data: paiements }, { data: membres }, { data: activite }] =
    await Promise.all([
      supabase.from('schools').select('id, name, slug, status, created_at, disabled_features'),
      supabase.from('students').select('school_id, created_at').is('deleted_at', null),
      supabase.from('payments').select('amount, currency, status, paid_at, created_at'),
      supabase.from('school_memberships').select('school_id, status'),
      // Le dernier signe de vie de chaque école.
      //
      // PAS `access_events` : il ne retient que la vie d'un compte (créé,
      // activé, suspendu) — 8 lignes sur douze mois, ce qui faisait passer pour
      // dormantes des écoles actives. Le journal d'audit, lui, enregistre
      // chaque geste réel : 202 lignes sur la même période.
      supabase.from('audit_logs').select('school_id, created_at').gte('created_at', depuis).order('created_at', { ascending: false }).limit(5000),
    ]);

  type Ecole = { id: string; name: string; slug: string; status: string; created_at: string; disabled_features: string[] | null };
  const listeEcoles = (ecoles ?? []) as unknown as Ecole[];

  // --- Évolution mois par mois ---------------------------------------------
  const cases = new Map<string, MonthPoint>();
  for (let i = 0; i < months; i++) {
    const d = new Date(debut);
    d.setMonth(debut.getMonth() + i);
    const clef = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    cases.set(clef, { month: clef, label: `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, schools: 0, students: 0, revenue: 0 });
  }
  const ajoute = (iso: string | null, champ: 'schools' | 'students' | 'revenue', valeur = 1) => {
    if (!iso) return;
    const c = cases.get(iso.slice(0, 7));
    if (c) c[champ] += valeur;
  };

  for (const e of listeEcoles) ajoute(e.created_at, 'schools');
  for (const el of (eleves ?? []) as { created_at: string }[]) ajoute(el.created_at, 'students');

  let cashedIn = 0;
  let outstanding = 0;
  let currency = 'XOF';
  for (const p of (paiements ?? []) as { amount: number; currency: string; status: string; paid_at: string | null; created_at: string }[]) {
    const montant = Number(p.amount) || 0;
    if (p.currency) currency = p.currency;
    if (p.status === 'CONFIRMED' || p.status === 'SETTLED' || p.status === 'PAID') {
      cashedIn += montant;
      ajoute(p.paid_at ?? p.created_at, 'revenue', montant);
    } else if (p.status !== 'CANCELLED' && p.status !== 'REFUNDED') {
      outstanding += montant;
    }
  }

  // --- Par établissement ----------------------------------------------------
  const elevesPar = compte((eleves ?? []) as { school_id: string }[], (r) => r.school_id);
  const membresPar = compte(
    ((membres ?? []) as { school_id: string; status: string }[]).filter((m) => m.status === 'ACTIVE'),
    (r) => r.school_id,
  );
  const vuPar = new Map<string, string>();
  for (const a of (activite ?? []) as { school_id: string | null; created_at: string }[]) {
    if (a.school_id && !vuPar.has(a.school_id)) vuPar.set(a.school_id, a.created_at);
  }

  const maintenant = Date.now();
  const schools: SchoolStat[] = listeEcoles
    .map((e) => {
      const vu = vuPar.get(e.id) ?? null;
      return {
        id: e.id,
        name: e.name,
        slug: e.slug,
        status: e.status,
        students: elevesPar.get(e.id) ?? 0,
        staff: membresPar.get(e.id) ?? 0,
        lastSeen: vu,
        idleDays: vu ? Math.floor((maintenant - new Date(vu).getTime()) / 86_400_000) : null,
        disabledModules: (e.disabled_features ?? []).length,
      };
    })
    .sort((a, b) => b.students - a.students);

  // Une école qu'on n'a pas vue depuis un mois est en train de partir : c'est
  // l'indicateur le plus utile, et personne ne l'affichait.
  const dormant = schools.filter((s) => s.status === 'ACTIVE' && (s.idleDays === null || s.idleDays > 30)).length;

  // --- Qui se sert de quoi --------------------------------------------------
  const moduleUse = await usageParModule(listeEcoles.length);

  return { months: [...cases.values()], schools, dormant, cashedIn, outstanding, currency, moduleUse };
}

/**
 * Combien d'écoles se servent vraiment de chaque module.
 *
 * On ne regarde pas ce qui est activé — tout l'est par défaut — mais ce qui a
 * produit des données. Un module vendu mais jamais utilisé est un module qu'on
 * ne saura pas défendre au renouvellement.
 */
async function usageParModule(_total: number): Promise<{ module: string; schools: number }[]> {
  const supabase = await createClient();
  const tables: { module: string; table: string }[] = [
    { module: 'Élèves', table: 'students' },
    { module: 'Emploi du temps', table: 'schedule_sessions' },
    { module: 'Présences', table: 'attendance_registers' },
    { module: 'Notes', table: 'grades' },
    { module: 'Bulletins', table: 'report_cards' },
    { module: 'Discipline', table: 'discipline_incidents' },
    { module: 'Annonces', table: 'announcements' },
  ];

  const out: { module: string; schools: number }[] = [];
  for (const t of tables) {
    // On ne lit que la colonne school_id, et on distingue en mémoire : compter
    // en base demanderait une vue par table.
    const { data, error } = await supabase.from(t.table as never).select('school_id').limit(5000);
    if (error) continue;
    const ids = new Set((data ?? []).map((r) => (r as { school_id: string }).school_id));
    out.push({ module: t.module, schools: ids.size });
  }
  return out.sort((a, b) => b.schools - a.schools);
}

function compte<T>(rows: T[], clef: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = clef(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
