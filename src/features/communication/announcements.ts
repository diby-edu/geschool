import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { resolveAudienceUserIds, notifyUsers } from '@/services/notifications';
import type { AnnouncementInput } from './schemas';

export type AnnouncementRow = {
  id: string;
  title: string;
  status: string;
  audience_label: string;
  published_at: string | null;
  expires_at: string | null;
};

type Audience = { all?: boolean; roles?: string[] };

function audienceLabel(a: Audience): string {
  if (a.all) return 'Tout l’établissement';
  return (a.roles ?? []).join(', ') || '—';
}

export async function listAnnouncements(ctx: TenantContext): Promise<AnnouncementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('announcements')
    .select('id, title, status, audience, published_at, expires_at')
    .eq('school_id', ctx.school.id)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    audience: Audience;
    published_at: string | null;
    expires_at: string | null;
  }[]).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    audience_label: audienceLabel(a.audience ?? {}),
    published_at: a.published_at,
    expires_at: a.expires_at,
  }));
}

export async function getAnnouncement(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, audience, status, published_at, expires_at')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data as unknown as {
    id: string;
    title: string;
    body: string;
    audience: Audience;
    status: string;
    published_at: string | null;
    expires_at: string | null;
  } | null;
}

function toRow(input: AnnouncementInput) {
  return {
    title: input.title,
    body: input.body,
    audience: { all: input.all, roles: input.all ? [] : input.roles } as unknown as Record<string, never>,
    expires_at: input.expiresAt ? input.expiresAt : null,
  };
}

export async function createAnnouncement(ctx: TenantContext, input: AnnouncementInput): Promise<string> {
  requireWritable(ctx, 'announcements.create');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('announcements')
    .insert({ school_id: ctx.school.id, ...toRow(input), status: 'DRAFT', author_id: ctx.user.id })
    .select('id')
    .single();
  if (error) throw error;
  await audit(ctx, { action: 'announcements.create', module: 'communication', entityType: 'announcement', entityId: data.id, after: { title: input.title } });
  return data.id;
}

export async function updateAnnouncement(ctx: TenantContext, id: string, input: AnnouncementInput): Promise<void> {
  requireWritable(ctx, 'announcements.publish');
  const supabase = await createClient();
  const existing = await getAnnouncement(ctx, id);
  if (!existing) throw new NotFoundError('Annonce introuvable.');
  const { error } = await supabase.from('announcements').update(toRow(input)).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'announcements.update', module: 'communication', entityType: 'announcement', entityId: id });
}

/**
 * Publie une annonce et NOTIFIE les destinataires (fan-out IN_APP). La création
 * des notifications passe par le service en service_role (leur policy d'insert
 * étant réservée). SMS réservé aux identifiants (ADR-010), jamais aux annonces.
 */
export async function publishAnnouncement(ctx: TenantContext, id: string): Promise<{ notified: number }> {
  requireWritable(ctx, 'announcements.publish');
  const supabase = await createClient();
  const a = await getAnnouncement(ctx, id);
  if (!a) throw new NotFoundError('Annonce introuvable.');
  if (a.status === 'PUBLISHED') throw new ConflictError('Cette annonce est déjà publiée.');

  const { error } = await supabase
    .from('announcements')
    .update({ status: 'PUBLISHED', published_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;

  const userIds = await resolveAudienceUserIds(ctx.school.id, a.audience ?? {});
  const notified = await notifyUsers(ctx.school.id, userIds, {
    type: 'announcement',
    title: a.title,
    body: a.body.slice(0, 500),
    entityType: 'announcement',
    entityId: id,
  });

  await audit(ctx, { action: 'announcements.publish', module: 'communication', entityType: 'announcement', entityId: id, after: { notified } });
  return { notified };
}

export async function archiveAnnouncement(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'announcements.publish');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('announcements')
    .update({ status: 'ARCHIVED' }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Annonce introuvable.');
  await audit(ctx, { action: 'announcements.archive', module: 'communication', entityType: 'announcement', entityId: id });
}
