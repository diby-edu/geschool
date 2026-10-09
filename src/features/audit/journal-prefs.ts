import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings } from '@/features/settings/school-settings';
import { AUDIT_MODULES, type AuditFilter, type AuditWho } from './queries';

/**
 * Affichage par défaut du journal, mémorisé pour l'école (school_settings,
 * espace `access`, clé `journal`). Il ne choisit que ce qu'on VOIT : tout est
 * toujours enregistré, et rien ne peut être effacé du journal.
 */
const KEY = 'journal';

const WHO: AuditWho[] = ['all', 'teachers', 'staff'];

export function parseWho(value: unknown): AuditWho {
  return WHO.includes(value as AuditWho) ? (value as AuditWho) : 'all';
}

export function cleanHidden(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((v): v is string => typeof v === 'string' && AUDIT_MODULES.includes(v))));
}

export async function readJournalPrefs(ctx: TenantContext): Promise<AuditFilter> {
  const settings = await readSettings(ctx, 'access');
  const saved = settings[KEY] as { hidden?: unknown; who?: unknown } | undefined;
  return { hidden: cleanHidden(saved?.hidden), who: parseWho(saved?.who) };
}

export function journalPatch(filter: AuditFilter): Record<string, unknown> {
  return { [KEY]: { hidden: cleanHidden(filter.hidden), who: parseWho(filter.who) } };
}
