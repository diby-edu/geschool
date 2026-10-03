import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import {
  ALERT_RECIPIENTS,
  DEFAULT_ATTENDANCE_POLICY,
  type AlertRecipient,
  type AttendancePolicy,
} from './policy-types';

/**
 * Les règles de présence, rangées avec les autres réglages de l'établissement.
 *
 * Ce qui n'est PAS réglable ici, et pourquoi :
 *   * l'appel se fait pendant le créneau, un point c'est tout — il atteste
 *     aussi que l'enseignant était là (migration 0084) ;
 *   * une absence se justifie jusqu'à la clôture de la période, pas X jours ;
 *   * qui peut justifier relève des droits, pas d'un réglage.
 */

export async function readAttendancePolicy(ctx: TenantContext): Promise<AttendancePolicy> {
  const s = await readSettings(ctx, 'attendance');
  return clean(s.policy);
}

export async function writeAttendancePolicy(ctx: TenantContext, patch: Partial<AttendancePolicy>): Promise<void> {
  const current = await readAttendancePolicy(ctx);
  await writeSettings(ctx, 'attendance', { policy: { ...current, ...patch } });
}

function clean(raw: unknown): AttendancePolicy {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const heures = (v: unknown, defaut: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n) : defaut;
  };
  const destinataires = Array.isArray(o.alertRecipients)
    ? (o.alertRecipients.filter((r) => ALERT_RECIPIENTS.includes(r as AlertRecipient)) as AlertRecipient[])
    : DEFAULT_ATTENDANCE_POLICY.alertRecipients;
  return {
    alertAfterHours: heures(o.alertAfterHours, DEFAULT_ATTENDANCE_POLICY.alertAfterHours),
    alertRecipients: destinataires,
    alertBySms: o.alertBySms === true,
    summonAfterUnjustifiedHours: heures(
      o.summonAfterUnjustifiedHours,
      DEFAULT_ATTENDANCE_POLICY.summonAfterUnjustifiedHours,
    ),
  };
}
