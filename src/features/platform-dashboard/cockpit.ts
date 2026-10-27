import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { schoolToday } from '@/features/dashboard/time';
import { readPlatformSettings } from '@/features/platform/settings';

/**
 * Poste de pilotage du Super Admin (0140, variante A « l'argent d'abord »).
 *
 * Une école paie UNE fois par an : chaque école est en essai, abonnée, ou son
 * abonnement est expiré (suspendue / résiliée à part ; sans abonnement pour les
 * écoles créées avant la facturation). La base lit la situation réelle à la date
 * du jour : un essai fini compte comme expiré, même sans changement à la main.
 */

export type Situation = 'TRIAL' | 'PAID' | 'EXPIRED' | 'STOPPED' | 'NONE';

export type CockpitSchool = {
  id: string;
  name: string;
  slug: string;
  situation: Situation;
  endsOn: string | null;
  graceEndsOn: string | null;
};

export type SchoolHealth = {
  id: string;
  name: string;
  slug: string;
  students: number;
  lastActivity: string | null;
  /** Jours de cours écoulés (avant aujourd'hui) sans aucune activité ; plafonné aux 30 derniers jours. */
  schoolDaysWithout: number;
  sessions5d: number;
  calls5d: number;
  grades7d: number;
  directionSeen7d: boolean;
  /** Seuil « à risque » réglé par la plateforme (lot 6), posé à la lecture. */
  riskDays?: number;
};

export type PlatformCockpit = {
  today: string;
  money: {
    currency: string;
    yearStart: string;
    receivedYear: number;
    receivedMonth: number;
    payingSchoolsYear: number;
    months: { month: string; amount: number }[];
    byModule: { module: string; amount: number }[];
  };
  situations: {
    graceDays: number;
    counts: Record<Situation, number>;
    trialsEndingSoon: number;
    expiredInGrace: number;
    expiredCut: number;
    schools: CockpitSchool[];
  };
  people: {
    students: number;
    studentsNewMonth: number;
    teachers: number;
    guardians: number;
    parentsConnected: number;
    schoolsNewMonth: number;
  };
  growth: { month: string; schools: number }[];
  health: SchoolHealth[];
  sms: {
    sent: number;
    parts: number;
    delivered: number;
    failed: number;
    failedYesterday: number;
    cost: number;
    nearQuota: { id: string; name: string; slug: string; used: number; allowed: number }[];
  };
};

/** Seuil décidé : une école est « à risque » après 2 jours de cours sans activité. */
export const RISK_SCHOOL_DAYS = 2;

/** Fuseau de la plateforme (Côte d'Ivoire). */
export const PLATFORM_TIMEZONE = 'Africa/Abidjan';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export async function getPlatformCockpit(): Promise<{ data: PlatformCockpit | null; missing: boolean }> {
  const supabase = await createClient();
  const [r, settings] = await Promise.all([
    callRpc<PlatformCockpit>(supabase, 'platform_cockpit', { p_today: schoolToday(PLATFORM_TIMEZONE) }),
    readPlatformSettings(),
  ]);
  if (!r.data) return { data: null, missing: r.missing };
  const d = r.data;
  d.health = d.health.map((h) => ({ ...h, riskDays: settings.riskDays }));
  // Les montants arrivent en texte (numeric) : tout en nombres pour l'affichage.
  d.money.receivedYear = num(d.money.receivedYear);
  d.money.receivedMonth = num(d.money.receivedMonth);
  d.money.months = d.money.months.map((m) => ({ month: m.month, amount: num(m.amount) }));
  d.money.byModule = d.money.byModule.map((m) => ({ module: m.module, amount: num(m.amount) }));
  d.sms.cost = num(d.sms.cost);
  return { data: d, missing: false };
}

/**
 * Les jours sans activité ne se comptent que sur les 30 derniers jours : au-delà,
 * on écrit « plus de 4 semaines » plutôt qu'un nombre de jours faux (une école
 * silencieuse depuis le 14 septembre n'a pas « 21 jours » sans activité).
 */
export function daysWithoutText(h: SchoolHealth, today: string): string {
  const windowStart = new Date(`${today}T00:00:00Z`).getTime() - 30 * 86_400_000;
  if (!h.lastActivity || new Date(`${h.lastActivity}T00:00:00Z`).getTime() < windowStart) return 'plus de 4 semaines';
  return `${h.schoolDaysWithout} j`;
}

export function isAtRisk(h: SchoolHealth): boolean {
  return h.schoolDaysWithout >= (h.riskDays ?? RISK_SCHOOL_DAYS);
}

/** « 1 900 000 F » : la devise des écoles (FCFA) s'écrit F. */
export function money(amount: number, currency: string): string {
  const unit = currency === 'XOF' || currency === 'XAF' || currency === 'FCFA' ? 'F' : currency;
  return `${Math.round(amount).toLocaleString('fr-FR')} ${unit}`;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2026-10 » → « oct. » */
export function monthShort(ym: string): string {
  return MOIS[Number(ym.slice(5, 7)) - 1] ?? ym;
}
