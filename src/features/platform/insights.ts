import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from './admin';
import { MAX_FAILURES } from '@/services/login-lockout';
import { maskIdentifier } from './growth';

/**
 * Courbes, activité et sécurité de la page Technique (lot C, 0155) : lecture
 * avec la session du Super Admin.
 */

export type SeriesPoint = {
  t: string;
  siteMs: number | null;
  siteMax: number | null;
  siteDown: number;
  memPct: number | null;
  cpuPct: number | null;
  dbBytes: number | null;
};

export const PERIODS = [
  { key: '24h', label: '24 heures', hours: 24 },
  { key: '7j', label: '7 jours', hours: 168 },
  { key: '30j', label: '30 jours', hours: 720 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function getSeries(hours: number): Promise<SeriesPoint[] | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_metric_series' as never, { p_hours: hours } as never);
  if (error) return null;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
    t: String(p.t),
    siteMs: num(p.siteMs),
    siteMax: num(p.siteMax),
    siteDown: Number(p.siteDown ?? 0),
    memPct: num(p.memPct),
    cpuPct: num(p.cpuPct),
    dbBytes: num(p.dbBytes),
  }));
}

export type SchoolActivity = { id: string; name: string; slug: string; logins: number; registers: number; grades: number; sms: number; lastAction: string | null };
export type Activity = { today: string; schools: SchoolActivity[]; days: { d: string; registers: number; grades: number; sms: number }[] };

export async function getActivity(): Promise<Activity | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_activity' as never);
  if (error || !data) return null;
  const r = data as unknown as Activity;
  return {
    today: r.today,
    schools: r.schools.map((s) => ({ ...s, logins: Number(s.logins), registers: Number(s.registers), grades: Number(s.grades), sms: Number(s.sms) })),
    days: r.days.map((d) => ({ d: d.d, registers: Number(d.registers), grades: Number(d.grades), sms: Number(d.sms) })),
  };
}

export type Security = {
  failuresLastHour: number;
  failures: { who: string; school: string | null; n: number; last: string; locked: boolean; ips: number }[];
  changes: { action: string; at: string; actor: string | null; school: string | null }[];
};

export async function getSecurity(): Promise<Security | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_security' as never);
  if (error || !data) return null;
  const r = data as unknown as {
    failuresLastHour: number;
    failures: { key: string; n: number; last: string; recent: number; ips: number; school: string | null }[];
    changes: Security['changes'];
  };
  return {
    failuresLastHour: Number(r.failuresLastHour),
    // La clé vaut « school:<id>:<identifiant> » ou « email:<adresse> » : on n'en montre que l'identifiant, masqué.
    failures: r.failures.map((f) => ({
      who: maskIdentifier(f.key.startsWith('school:') ? f.key.split(':').slice(2).join(':') : f.key.replace(/^email:/, '')),
      school: f.school,
      n: Number(f.n),
      last: f.last,
      locked: Number(f.recent) >= MAX_FAILURES,
      ips: Number(f.ips),
    })),
    changes: r.changes,
  };
}
