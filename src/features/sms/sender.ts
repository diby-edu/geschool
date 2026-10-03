import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import { readSenderForSchool } from './platform';
import {
  DEFAULT_SENDER,
  SENDER_STATUSES,
  effectiveSender,
  type SchoolSender,
  type SenderStatus,
} from './sender-types';

/**
 * Le nom d'expéditeur d'un établissement.
 *
 * Rangé avec les autres réglages de notification de l'école. Ce qui est décidé
 * ici ne change rien à la facture — seulement le nom que la famille voit
 * s'afficher sur son téléphone.
 */

export type SenderView = SchoolSender & {
  /** Le nom qui partira réellement, compte tenu de l'état de la validation. */
  effective: string;
  /** Le nom prêté par la plateforme. */
  platformSender: string;
  pricePerSms: number;
};

export async function readSender(ctx: TenantContext): Promise<SenderView> {
  const [settings, plateforme] = await Promise.all([readSettings(ctx, 'notifications'), readSenderForSchool()]);
  const sender = clean(settings.smsSender);
  return {
    ...sender,
    effective: effectiveSender(sender, plateforme.fallbackSender),
    platformSender: plateforme.fallbackSender,
    pricePerSms: plateforme.pricePerSms,
  };
}

export async function writeSender(ctx: TenantContext, patch: Partial<SchoolSender>): Promise<void> {
  const settings = await readSettings(ctx, 'notifications');
  const current = clean(settings.smsSender);
  await writeSettings(ctx, 'notifications', { smsSender: { ...current, ...patch } });
}

/** Le nom sous lequel partent les SMS de cette école, et rien d'autre. */
export async function senderNameFor(ctx: TenantContext): Promise<string> {
  return (await readSender(ctx)).effective;
}

function clean(raw: unknown): SchoolSender {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const status = SENDER_STATUSES.includes(o.status as SenderStatus) ? (o.status as SenderStatus) : DEFAULT_SENDER.status;
  const date = typeof o.requestedOn === 'string' && !Number.isNaN(new Date(o.requestedOn).getTime())
    ? o.requestedOn
    : null;
  return {
    name: texte(o.name, 11),
    status,
    requestedOn: date,
    rejectionReason: texte(o.rejectionReason, 300) || null,
    usePlatform: o.usePlatform === true,
  };
}
