import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from './admin';

/**
 * L'état de marche de la plateforme.
 *
 * Trois choses qu'on ne voyait nulle part et qui préviennent les ennuis : les
 * SMS qui n'arrivent pas, les travaux de fond en échec, et les comptes bloqués
 * après trop d'essais. Chacun est une plainte à venir.
 */

export type HealthReport = {
  sms: { sent: number; delivered: number; failed: number; recentFailures: number; cost: number; last: string | null };
  /**
   * Travaux de fond (génération d'emploi du temps).
   *
   * `failed` compte tout l'historique de la période, `recentFailures` les sept
   * derniers jours. La distinction compte : un échec d'il y a trois semaines,
   * déjà corrigé depuis, ne doit pas allumer un voyant rouge à chaque
   * consultation — sinon on finit par ne plus le regarder.
   */
  jobs: { pending: number; failed: number; recentFailures: number; lastFailure: string | null; last: string | null };
  /** Tentatives de connexion échouées sur les dernières 24 heures. */
  failedLogins: number;
  /** Écoles dont au moins un module est coupé. */
  schoolsWithDisabledModules: number;
};

export async function getHealth(): Promise<HealthReport> {
  await requireAdmin();
  const supabase = await createClient();
  const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const veille = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: sms }, { data: jobs }, { count: echecs }, { data: ecoles }] = await Promise.all([
    supabase.from('sms_messages').select('status, cost, created_at').gte('created_at', depuis),
    supabase.from('schedule_generation_jobs').select('status, queued_at').gte('queued_at', depuis),
    // Une rafale d'échecs de connexion précède toujours un appel au support.
    supabase.from('login_attempts').select('id', { count: 'exact', head: true }).gte('created_at', veille),
    // Un module coupé laisse une ligne ici ; aucune ligne = tout est ouvert.
    supabase.from('school_features').select('school_id').eq('is_enabled', false),
  ]);

  const smsRows = (sms ?? []) as { status: string; cost: number | null; created_at: string }[];
  const jobRows = (jobs ?? []) as { status: string; queued_at: string }[];
  const recent = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const echecsJobs = jobRows.filter((j) => j.status === 'FAILED');
  return {
    sms: {
      sent: smsRows.filter((s) => s.status === 'SENT' || s.status === 'DELIVERED').length,
      delivered: smsRows.filter((s) => s.status === 'DELIVERED').length,
      failed: smsRows.filter((s) => s.status === 'FAILED').length,
      recentFailures: smsRows.filter((s) => s.status === 'FAILED' && s.created_at >= recent).length,
      cost: smsRows.reduce((t, s) => t + Number(s.cost ?? 0), 0),
      last: smsRows.map((s) => s.created_at).sort().at(-1) ?? null,
    },
    jobs: {
      pending: jobRows.filter((j) => j.status === 'QUEUED' || j.status === 'RUNNING').length,
      failed: echecsJobs.length,
      recentFailures: echecsJobs.filter((j) => j.queued_at >= recent).length,
      lastFailure: echecsJobs.map((j) => j.queued_at).sort().at(-1) ?? null,
      last: jobRows.map((j) => j.queued_at).sort().at(-1) ?? null,
    },
    failedLogins: echecs ?? 0,
    schoolsWithDisabledModules: new Set(
      ((ecoles ?? []) as { school_id: string }[]).map((e) => e.school_id),
    ).size,
  };
}
