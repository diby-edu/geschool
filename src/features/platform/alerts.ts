import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { requireAdmin } from './admin';
import { normalizeAlertSettings, type AlertSettings } from './alerts-core';
import { TASKS } from './technical';

/**
 * Onglets « Alertes » et « Tâches » de la page Technique (lot B, 0154) :
 * lecture avec la session du Super Admin (la base réserve tout à la plateforme).
 */

export type AlertRow = {
  id: string;
  key: string;
  message: string;
  openedAt: string;
  lastSentAt: string | null;
  reminders: number;
  channels: string[];
  resolvedAt: string | null;
};

export type QueueView = {
  /** Par tâche connue : réussies, échouées, en attente, en cours, sur 7 jours. */
  byTask: { name: string; label: string; completed: number; failed: number; waiting: number; active: number }[];
  failed: { id: string; name: string; label: string; at: string; error: string | null; retryable: boolean }[];
};

export async function readAlertSettingsForAdmin(): Promise<AlertSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_settings').select('settings').eq('namespace', 'alerts').maybeSingle();
  return normalizeAlertSettings(data?.settings);
}

export async function writeAlertSettings(userId: string, settings: AlertSettings): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ namespace: 'alerts', settings: settings as never, updated_by: userId }, { onConflict: 'namespace' });
  if (error) throw error;
}

export async function getAlertsView(): Promise<{ settings: AlertSettings; open: AlertRow[]; history: AlertRow[]; emailReady: boolean } | null> {
  await requireAdmin();
  const supabase = await createClient();
  const [settings, { data, error }] = await Promise.all([
    readAlertSettingsForAdmin(),
    supabase
      .from('platform_alerts' as never)
      .select('id, key, message, opened_at, last_sent_at, reminders, sent_channels, resolved_at')
      .gt('opened_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('opened_at', { ascending: false })
      .limit(100),
  ]);
  if (error) return null; // migration 0154 pas encore appliquée
  const rows: AlertRow[] = ((data ?? []) as unknown as {
    id: string; key: string; message: string; opened_at: string; last_sent_at: string | null; reminders: number; sent_channels: string[]; resolved_at: string | null;
  }[]).map((a) => ({
    id: a.id, key: a.key, message: a.message, openedAt: a.opened_at, lastSentAt: a.last_sent_at, reminders: a.reminders, channels: a.sent_channels ?? [], resolvedAt: a.resolved_at,
  }));
  const e = serverEnv();
  return { settings, open: rows.filter((r) => !r.resolvedAt), history: rows, emailReady: Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD) };
}

export async function getQueueView(): Promise<QueueView | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_job_queue' as never);
  if (error || !data) return null;
  const raw = data as unknown as {
    counts: { name: string; state: string; n: number }[];
    failed: { id: string; name: string; createdOn: string; completedOn: string | null; error: string | null }[];
  };
  const labelOf = new Map<string, string>(TASKS.map((t) => [t.name, t.label]));
  const count = (name: string, states: string[]) => raw.counts.filter((c) => c.name === name && states.includes(c.state)).reduce((n, c) => n + Number(c.n), 0);
  const names = [...new Set([...TASKS.map((t) => t.name as string), ...raw.counts.map((c) => c.name)])];
  return {
    byTask: names.map((name) => ({
      name,
      label: labelOf.get(name) ?? name,
      completed: count(name, ['completed']),
      failed: count(name, ['failed']),
      waiting: count(name, ['created', 'retry']),
      active: count(name, ['active']),
    })),
    failed: raw.failed.map((f) => ({
      id: f.id,
      name: f.name,
      label: labelOf.get(f.name) ?? f.name,
      at: f.completedOn ?? f.createdOn,
      error: f.error,
      retryable: labelOf.has(f.name),
    })),
  };
}
