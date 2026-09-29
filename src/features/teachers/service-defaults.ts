import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import { EMPLOYMENT_TYPES, NO_BOUNDS, type ServiceBounds, type ServiceDefaults } from './service-types';

export { EMPLOYMENT_TYPES, EMPLOYMENT_LABELS } from './service-types';
export type { EmploymentType, ServiceBounds, ServiceDefaults } from './service-types';

/**
 * Service hebdomadaire par défaut, selon le type de contrat.
 *
 * Une école de cent soixante-dix enseignants ne saisira pas cent soixante-dix
 * plafonds. Elle dit une fois « un permanent fait 18 séances, un vacataire 12 »,
 * et chaque fiche part de là. Le plafond propre à un enseignant, quand il est
 * renseigné, l'emporte toujours : le défaut n'écrase jamais une décision.
 *
 * Stocké dans `school_settings` (espace `schedule`), donc sans migration : une
 * école qui ne règle rien n'a simplement aucun défaut, et rien ne se bloque.
 *
 * Les valeurs sont en SÉANCES, comme partout où l'on parle de service.
 */

const SETTINGS_KEY = 'teacherServiceDefaults';

/** Une borne lue depuis le JSON : on n'accepte qu'un entier raisonnable. */
function bound(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 60 ? n : null;
}

export async function readServiceDefaults(ctx: TenantContext): Promise<ServiceDefaults> {
  const settings = await readSettings(ctx, 'schedule');
  const raw = settings[SETTINGS_KEY];
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as ServiceDefaults;
  for (const type of EMPLOYMENT_TYPES) {
    const entry = source[type];
    const obj = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    out[type] = { min: bound(obj.min), max: bound(obj.max) };
  }
  return out;
}

export async function writeServiceDefaults(ctx: TenantContext, defaults: ServiceDefaults): Promise<void> {
  const clean = {} as Record<string, ServiceBounds>;
  for (const type of EMPLOYMENT_TYPES) {
    const b = defaults[type] ?? NO_BOUNDS;
    if (b.min !== null || b.max !== null) clean[type] = b;
  }
  await writeSettings(ctx, 'schedule', { [SETTINGS_KEY]: clean });
}
