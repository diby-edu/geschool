import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { isSyntheticEmail } from '@/features/auth/service';

/**
 * Lecture des demandes faites à la plateforme (lot 5, 0148). La base filtre :
 * dans l'école, ceux qui ont `support.contact` ; la plateforme voit tout.
 */

export type RequestStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  OPEN: 'Sans réponse',
  ANSWERED: 'Répondu',
  CLOSED: 'Terminée',
};

export type RequestRow = {
  id: string;
  schoolId: string;
  schoolName: string;
  subject: string;
  status: RequestStatus;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type RequestThread = RequestRow & {
  messages: { id: string; fromPlatform: boolean; authorName: string; body: string; createdAt: string }[];
};

type Raw = {
  id: string;
  school_id: string;
  author_id: string | null;
  subject: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  schools: { name: string } | null;
};

async function namesOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from('users').select('id, display_name, first_name, last_name, auth_email').in('id', unique);
  return new Map(
    ((data ?? []) as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; auth_email: string | null }[]).map((u) => [
      u.id,
      `${(u.last_name ?? '').toUpperCase()} ${u.first_name ?? ''}`.trim() || u.display_name || (u.auth_email && !isSyntheticEmail(u.auth_email) ? u.auth_email : '—'),
    ]),
  );
}

async function toRows(raws: Raw[]): Promise<RequestRow[]> {
  const names = await namesOf(raws.map((r) => r.author_id));
  return raws.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? '—',
    subject: r.subject,
    status: r.status,
    authorName: (r.author_id && names.get(r.author_id)) || '—',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

const COLS = 'id, school_id, author_id, subject, status, created_at, updated_at, schools(name)';

/** Les demandes de l'école (côté école). */
export async function listSchoolRequests(ctx: TenantContext): Promise<RequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('platform_requests' as never)
    .select(COLS)
    .eq('school_id', ctx.school.id)
    .order('updated_at', { ascending: false })
    .limit(100);
  return toRows((data ?? []) as unknown as Raw[]);
}

/** Toutes les demandes (côté plateforme), les sans réponse d'abord. */
export async function listAllRequests(status?: RequestStatus): Promise<RequestRow[]> {
  const supabase = await createClient();
  let q = supabase.from('platform_requests' as never).select(COLS).order('updated_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return toRows((data ?? []) as unknown as Raw[]);
}

export async function countOpenRequests(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from('platform_requests' as never).select('id', { count: 'exact', head: true }).eq('status', 'OPEN');
  return count ?? 0;
}

/** Une demande et son fil ; null si elle n'existe pas ou n'est pas visible. */
export async function getRequestThread(id: string, schoolId?: string): Promise<RequestThread | null> {
  const supabase = await createClient();
  let q = supabase.from('platform_requests' as never).select(COLS).eq('id', id);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const [row] = await toRows([data as unknown as Raw]);
  const { data: msgs } = await supabase
    .from('platform_request_messages' as never)
    .select('id, author_id, from_platform, body, created_at')
    .eq('request_id', id)
    .order('created_at');
  const list = (msgs ?? []) as unknown as { id: string; author_id: string | null; from_platform: boolean; body: string; created_at: string }[];
  const names = await namesOf(list.map((m) => m.author_id));
  return {
    ...row!,
    messages: list.map((m) => ({
      id: m.id,
      fromPlatform: m.from_platform,
      authorName: m.from_platform ? 'La plateforme' : (m.author_id && names.get(m.author_id)) || '—',
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}
