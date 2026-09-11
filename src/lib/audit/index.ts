import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantContext } from '@/lib/tenant/context';
import type { Json } from '@/types/database';

/**
 * Journal d'audit (docs/DATABASE.md §14, migration 0027).
 *
 * audit_logs est IMMUABLE pour tout client : aucune policy n'autorise
 * l'insertion cote authenticated. L'ecriture passe donc par le client
 * service_role — c'est l'une des rares operations autorisees a le faire
 * (ADR-013), et c'est justifie : un journal que son sujet pourrait fabriquer
 * ne vaudrait rien.
 *
 * Regle de securite : aucun secret, aucun mot de passe ne doit atteindre
 * `before`/`after`. maskSensitive retire les champs a risque avant ecriture
 * (ADR-006).
 */

export type AuditEntry = {
  action: string;
  module: string;
  entityType?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

const SENSITIVE_KEYS = new Set([
  'password',
  'mot_de_passe',
  'temp_password',
  'encrypted_password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'service_role_key',
  'api_key',
]);

/** Retire recursivement les champs sensibles d'un objet destine a l'audit. */
function maskSensitive(value: unknown, depth = 0): Json {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  if (typeof value !== 'object') return null;

  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[masque]' : maskSensitive(v, depth + 1);
  }
  return out;
}

/**
 * Ecrit une entree d'audit. Ne leve jamais : un echec de journalisation ne doit
 * pas faire echouer l'action metier qui a, elle, reussi. L'erreur est loguee.
 */
export async function audit(ctx: TenantContext, entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient('worker.job');
    const { error } = await admin.from('audit_logs').insert({
      school_id: ctx.school.id,
      actor_user_id: ctx.user.id,
      actor_is_platform_admin: ctx.isPlatformAdmin,
      actor_role: ctx.membership?.roles[0] ?? (ctx.isPlatformAdmin ? 'PLATFORM_ADMIN' : null),
      action: entry.action,
      module: entry.module,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before: entry.before === undefined ? null : maskSensitive(entry.before),
      after: entry.after === undefined ? null : maskSensitive(entry.after),
      request_id: entry.requestId ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
    });
    if (error) console.error('[audit] insertion refusee', error.message);
  } catch (error) {
    console.error('[audit] erreur inattendue', error);
  }
}

/**
 * Audit d'une action plateforme, hors contexte d'un etablissement precis.
 */
export async function auditPlatform(
  actorUserId: string,
  entry: AuditEntry & { schoolId?: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient('worker.job');
    await admin.from('audit_logs').insert({
      school_id: entry.schoolId ?? null,
      actor_user_id: actorUserId,
      actor_is_platform_admin: true,
      action: entry.action,
      module: entry.module,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before: entry.before === undefined ? null : maskSensitive(entry.before),
      after: entry.after === undefined ? null : maskSensitive(entry.after),
    });
  } catch (error) {
    console.error('[audit] erreur inattendue', error);
  }
}
