import 'server-only';

import tls from 'node:tls';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';
import { normalizePhone } from '@/lib/auth/identifier';
import { clean as normalizePlatformSms } from '@/features/sms/platform';
import { smsBalance } from '@/features/sms/balance';
import { TASKS } from '@/features/platform/technical';
import {
  ALERT_CHECKS,
  evaluateAlerts,
  normalizeAlertSettings,
  smsAllowedNow,
  type AlertCheckKey,
  type AlertCondition,
  type AlertInput,
  type AlertSettings,
} from '@/features/platform/alerts-core';
import { sendAndLog } from './sms-log';
import type { MetricSnapshot } from './platform-metrics';

/**
 * Alertes de la page Technique (lot B, 0154).
 *
 * Le worker vérifie après chaque relevé (toutes les 5 min) ; le site web, lui,
 * surveille le worker (instrumentation.ts) — chacun garde l'autre. Un problème
 * = une ligne de platform_alerts : envoyée à l'ouverture, rappelée si elle dure,
 * annoncée « réglée » à la fin. Seul le VPS envoie (base partagée avec le poste).
 */

const admin = () => createAdminClient('platform.monitoring');
const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? (a / b) * 100 : null);

export async function readAlertSettings(): Promise<AlertSettings> {
  const { data } = await admin().from('platform_settings').select('settings').eq('namespace', 'alerts').maybeSingle();
  return normalizeAlertSettings(data?.settings);
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export const emailConfigured = () => {
  const e = serverEnv();
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD);
};

async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: 'e-mail non branché (SMTP_* vides)' };
  const e = serverEnv();
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
    });
    await transport.sendMail({ from: e.SMTP_FROM || e.SMTP_USER, to, subject, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : 'envoi impossible' };
  }
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(to, serverEnv().DEFAULT_PHONE_COUNTRY);
  if (!phone) return { ok: false, error: 'numéro invalide' };
  const { data } = await admin().from('platform_settings').select('settings').eq('namespace', 'sms').maybeSingle();
  const sms = normalizePlatformSms(data?.settings);
  // Au nom de la plateforme (école vide) : hors du quota de toute école.
  const r = await sendAndLog({ schoolId: null, to: phone, body, sender: sms.fallbackSender, kind: 'PLATFORM_ALERT', pricePerSms: sms.pricePerSms });
  return r.ok ? { ok: true } : { ok: false, error: 'SMS refusé par l’opérateur' };
}

/** Envoie sur les canaux réglés ; renvoie ceux qui sont réellement partis. */
async function dispatch(s: AlertSettings, c: { urgent: boolean }, subject: string, text: string, now: Date): Promise<string[]> {
  const sent: string[] = [];
  if (smsAllowedNow(s, c, now) && s.phone) {
    if ((await sendSms(s.phone, text)).ok) sent.push('SMS');
  }
  if (s.email && s.emailTo) {
    if ((await sendEmail(s.emailTo, subject, `${text}\n\n${publicEnv.NEXT_PUBLIC_APP_URL}/admin/technique`)).ok) sent.push('E-mail');
  }
  return sent;
}

const SHORT = 'Gestion Scolaire';
const hm = (d: Date) => d.toISOString().slice(11, 16);

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------

/** Jours avant l'expiration du certificat HTTPS du site (null : pas de HTTPS, ou injoignable). */
export function certDaysLeft(url = publicEnv.NEXT_PUBLIC_APP_URL): Promise<number | null> {
  return new Promise((resolve) => {
    let host: string;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return resolve(null);
      host = u.hostname;
    } catch {
      return resolve(null);
    }
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? (new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000 : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function gather(now: Date): Promise<AlertInput> {
  const db = admin();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ data: snaps }, { data: backups }, { data: queue }, { data: errs }, { count: fails }, { data: limit }, credit, cert] = await Promise.all([
    db.from('platform_metrics' as never).select('taken_at, data').order('taken_at', { ascending: false }).limit(2),
    db.from('platform_backups' as never).select('started_at, status').in('status', ['OK', 'FAILED']).order('started_at', { ascending: false }).limit(10),
    db.rpc('platform_job_queue' as never),
    db.from('app_errors' as never).select('occurrences').gt('last_seen', hourAgo),
    db.from('login_attempts').select('*', { count: 'exact', head: true }).gt('created_at', hourAgo),
    db.from('platform_settings').select('settings').eq('namespace', 'platform').maybeSingle(),
    smsBalance(),
    certDaysLeft(),
  ]);

  const list = (snaps ?? []) as unknown as { taken_at: string; data: MetricSnapshot }[];
  const last = list[0]?.data ?? null;
  const bk = (backups ?? []) as unknown as { started_at: string; status: string }[];
  const lastOk = bk.find((b) => b.status === 'OK');
  const failed = ((queue as { failed?: { name: string; completedOn: string | null; createdOn: string }[] } | null)?.failed ?? []).filter(
    (j) => (j.completedOn ?? j.createdOn) > hourAgo,
  );
  const labelOf = new Map<string, string>(TASKS.map((t) => [t.name, t.label]));
  const dbLimitMb = Number((limit?.settings as { dbLimitMb?: number } | null)?.dbLimitMb) || 500;

  return {
    now,
    site: last ? { lastMs: last.timings.site, previousMs: list[1]?.data.timings.site ?? last.timings.site } : null,
    lastSnapshotMinutes: list[0] ? Math.round((now.getTime() - new Date(list[0].taken_at).getTime()) / 60_000) : null,
    memPct: pct(last?.memUsed, last?.memTotal),
    diskPct: pct(last?.diskUsed, last?.diskTotal),
    dbPct: last?.db ? pct(last.db.bytes, dbLimitMb * 1024 * 1024) : null,
    failedTasks: [...new Set(failed.map((j) => labelOf.get(j.name) ?? j.name))],
    hoursSinceBackup: lastOk ? (now.getTime() - new Date(lastOk.started_at).getTime()) / 3_600_000 : null,
    lastBackupFailed: bk[0]?.status === 'FAILED',
    smsCredit: credit,
    certDaysLeft: cert,
    errorsLastHour: ((errs ?? []) as unknown as { occurrences: number }[]).reduce((n, e) => n + e.occurrences, 0),
    loginFailsLastHour: fails ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ouvrir, rappeler, fermer
// ---------------------------------------------------------------------------

type OpenAlert = { id: string; key: string; message: string; opened_at: string; last_sent_at: string | null; reminders: number };

/**
 * Fait correspondre les alertes ouvertes aux problèmes du moment. `scope` :
 * les sortes que cet appel a le droit de fermer (le site web ne surveille que
 * le worker, il ne doit pas fermer une alerte « disque plein »).
 */
async function reconcile(conditions: AlertCondition[], scope: ReadonlySet<AlertCheckKey>, s: AlertSettings, now: Date): Promise<void> {
  const db = admin();
  const { data } = await db.from('platform_alerts' as never).select('id, key, message, opened_at, last_sent_at, reminders').is('resolved_at', null);
  const open = new Map(((data ?? []) as unknown as OpenAlert[]).map((a) => [a.key, a]));

  for (const c of conditions) {
    const existing = open.get(c.key);
    if (!existing) {
      const { data: row, error } = await db
        .from('platform_alerts' as never)
        .insert({ key: c.key, message: c.message } as never)
        .select('id')
        .single();
      if (error) continue; // déjà ouverte par l'autre gardien au même instant (index unique)
      const sent = await dispatch(s, c, `[${SHORT}] Alerte : ${c.message}`, `[${SHORT}] ALERTE ${hm(now)} : ${c.message} Voir la page Technique.`, now);
      await db
        .from('platform_alerts' as never)
        .update({ last_sent_at: sent.length ? now.toISOString() : null, sent_channels: sent } as never)
        .eq('id', (row as { id: string }).id);
      continue;
    }
    const due = !existing.last_sent_at || now.getTime() - new Date(existing.last_sent_at).getTime() >= s.reminderHours * 3_600_000;
    if (due) {
      const since = hm(new Date(existing.opened_at));
      const sent = await dispatch(s, c, `[${SHORT}] Toujours en cours : ${c.message}`, `[${SHORT}] RAPPEL : ${c.message} (depuis ${since}). Voir la page Technique.`, now);
      if (sent.length) {
        await db
          .from('platform_alerts' as never)
          .update({ last_sent_at: now.toISOString(), reminders: existing.reminders + 1, message: c.message } as never)
          .eq('id', existing.id);
      }
    }
  }

  const active = new Set(conditions.map((c) => c.key));
  for (const [key, a] of open) {
    if (active.has(key as AlertCheckKey) || !scope.has(key as AlertCheckKey)) continue;
    await db.from('platform_alerts' as never).update({ resolved_at: now.toISOString() } as never).eq('id', a.id);
    // On n'annonce « réglé » que ce qui avait été annoncé.
    if (a.last_sent_at) {
      const label = ALERT_CHECKS.find((c) => c.key === key)?.label ?? key;
      await dispatch(s, { urgent: false }, `[${SHORT}] Réglé : ${label}`, `[${SHORT}] REGLE ${hm(now)} : ${label}.`, now);
    }
  }
}

const ALL_KEYS = new Set<AlertCheckKey>(ALERT_CHECKS.map((c) => c.key));

/** Après chaque relevé du worker : toutes les vérifications. */
export async function checkAlerts(now = new Date()): Promise<AlertCondition[]> {
  if (process.platform !== 'linux') return [];
  const s = await readAlertSettings();
  const input = await gather(now);
  // Le worker qui vérifie est par définition vivant : sa propre alerte se ferme.
  const conditions = evaluateAlerts({ ...input, lastSnapshotMinutes: 0 }, s);
  await reconcile(conditions, ALL_KEYS, s, now);
  if (Math.random() < 0.02) {
    await admin().from('platform_alerts' as never).delete().lt('opened_at', new Date(now.getTime() - 90 * 86_400_000).toISOString());
  }
  return conditions;
}

/** Côté site web, toutes les 10 min : le worker fait-il encore ses relevés ? */
export async function watchWorker(now = new Date()): Promise<void> {
  if (process.platform !== 'linux') return;
  const s = await readAlertSettings();
  const { data } = await admin().from('platform_metrics' as never).select('taken_at').order('taken_at', { ascending: false }).limit(1).maybeSingle();
  const takenAt = (data as { taken_at: string } | null)?.taken_at;
  const minutes = takenAt ? Math.round((now.getTime() - new Date(takenAt).getTime()) / 60_000) : null;
  const conditions = evaluateAlerts(
    {
      now, site: null, lastSnapshotMinutes: minutes, memPct: null, diskPct: null, dbPct: null, failedTasks: [],
      hoursSinceBackup: 0, lastBackupFailed: false, smsCredit: null, certDaysLeft: null, errorsLastHour: null, loginFailsLastHour: null,
    },
    s,
  ).filter((c) => c.key === 'worker');
  await reconcile(conditions, new Set<AlertCheckKey>(['worker']), s, now);
}

/** « Envoyer une alerte d'essai » : ce qui est parti, canal par canal. */
export async function sendTestAlert(): Promise<{ sms: string; email: string }> {
  const s = await readAlertSettings();
  const text = `[${SHORT}] Essai : les alertes de la page Technique arrivent bien ici.`;
  const sms = !s.sms ? 'désactivé' : !s.phone ? 'aucun numéro' : (await sendSms(s.phone, text)).ok ? 'envoyé' : 'échec';
  let email = 'désactivé';
  if (s.email) {
    if (!s.emailTo) email = 'aucune adresse';
    else {
      const r = await sendEmail(s.emailTo, `[${SHORT}] Alerte d'essai`, text);
      email = r.ok ? 'envoyé' : `échec (${r.error})`;
    }
  }
  return { sms, email };
}
