'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { announcementSchema } from './schemas';
import { createAnnouncement, updateAnnouncement, publishAnnouncement, archiveAnnouncement } from './announcements';
import { markRead, markAllRead } from './inbox';

function parse(fd: FormData) {
  return announcementSchema.parse({
    title: fd.get('title'),
    body: fd.get('body'),
    all: fd.get('all') === 'on' || fd.get('all') === 'true',
    roles: fd.getAll('roles').map(String),
    expiresAt: fd.get('expiresAt') ?? '',
  });
}

export async function createAnnouncementAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const id = await createAnnouncement(ctx, parse(fd));
    redirect(`/e/${slug}/annonces/${id}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function updateAnnouncementAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateAnnouncement(ctx, id, parse(fd));
    redirect(`/e/${slug}/annonces/${id}?updated=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function publishAnnouncementAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const { notified } = await publishAnnouncement(ctx, id);
    redirect(`/e/${slug}/annonces/${id}?notified=${notified}`);
  });
}

export async function archiveAnnouncementAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await archiveAnnouncement(ctx, id);
    redirect(`/e/${slug}/annonces?archived=1`);
  });
}

export async function markReadAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await markRead(ctx, id);
    redirect(`/e/${slug}/notifications`);
  });
}

export async function markAllReadAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await markAllRead(ctx);
    redirect(`/e/${slug}/notifications?read=all`);
  });
}
