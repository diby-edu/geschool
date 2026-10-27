import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TenantContext } from '@/lib/tenant/context';
import { notifyUsers } from './notifications';

/**
 * « Contacter la plateforme » (lot 5, 0148, décidé le 2026-10-26) : une école
 * écrit, la plateforme répond, la réponse revient dans la cloche de l'auteur.
 *
 * Droit `support.contact`. Volontairement PAS `requireWritable` : une école
 * dont l'abonnement est coupé doit justement pouvoir écrire à la plateforme.
 * Écritures par le client d'administration, après ces contrôles.
 */

function canContact(ctx: TenantContext): void {
  if (!hasPermission(ctx, 'support.contact')) throw new AuthorizationError('Vous n’avez pas le droit d’écrire à la plateforme.');
}

function text(raw: unknown, max: number, what: string): string {
  const v = String(raw ?? '').trim();
  if (!v) throw new ValidationError(`Écrivez ${what}.`);
  if (v.length > max) throw new ValidationError(`${what[0]!.toUpperCase()}${what.slice(1)} est trop long (${max} caractères au plus).`);
  return v;
}

export async function createRequest(ctx: TenantContext, subjectRaw: unknown, bodyRaw: unknown): Promise<string> {
  canContact(ctx);
  const subject = text(subjectRaw, 140, 'l’objet');
  const body = text(bodyRaw, 4000, 'votre message');
  const admin = createAdminClient('notifications.send');
  const { data, error } = await admin
    .from('platform_requests' as never)
    .insert({ school_id: ctx.school.id, author_id: ctx.user.id, subject } as never)
    .select('id')
    .single();
  if (error || !data) throw new Error('La demande n’a pas pu être enregistrée.');
  const id = (data as { id: string }).id;
  await admin.from('platform_request_messages' as never).insert({ request_id: id, author_id: ctx.user.id, body } as never);
  await audit(ctx, { action: 'support.request', module: 'support', entityType: 'platform_request', entityId: id, after: { subject } });
  return id;
}

async function loadRequest(id: string) {
  const admin = createAdminClient('notifications.send');
  const { data } = await admin.from('platform_requests' as never).select('id, school_id, author_id, subject, status').eq('id', id).maybeSingle();
  if (!data) throw new NotFoundError('Demande introuvable.');
  return { admin, request: data as unknown as { id: string; school_id: string; author_id: string | null; subject: string; status: string } };
}

export async function replyFromSchool(ctx: TenantContext, id: string, bodyRaw: unknown): Promise<void> {
  canContact(ctx);
  const body = text(bodyRaw, 4000, 'votre message');
  const { admin, request } = await loadRequest(id);
  if (request.school_id !== ctx.school.id) throw new NotFoundError('Demande introuvable.');
  await admin.from('platform_request_messages' as never).insert({ request_id: id, author_id: ctx.user.id, body } as never);
  await admin.from('platform_requests' as never).update({ status: 'OPEN', updated_at: new Date().toISOString() } as never).eq('id', id);
}

/** La réponse de la plateforme : elle revient dans la cloche de l'auteur de la demande. L'appelant est Super Admin. */
export async function replyFromPlatform(actorId: string, id: string, bodyRaw: unknown): Promise<{ schoolId: string }> {
  const body = text(bodyRaw, 4000, 'la réponse');
  const { admin, request } = await loadRequest(id);
  await admin.from('platform_request_messages' as never).insert({ request_id: id, author_id: actorId, from_platform: true, body } as never);
  await admin.from('platform_requests' as never).update({ status: 'ANSWERED', updated_at: new Date().toISOString() } as never).eq('id', id);
  if (request.author_id) {
    await notifyUsers(request.school_id, [request.author_id], {
      type: 'platform.reply',
      title: `Réponse de la plateforme : ${request.subject}`.slice(0, 200),
      body: body.slice(0, 500),
      entityType: 'platform_request',
      entityId: id,
      data: { from: 'platform' },
    });
  }
  return { schoolId: request.school_id };
}

export async function closeRequest(id: string): Promise<{ schoolId: string }> {
  const { admin, request } = await loadRequest(id);
  await admin.from('platform_requests' as never).update({ status: 'CLOSED', updated_at: new Date().toISOString() } as never).eq('id', id);
  return { schoolId: request.school_id };
}
