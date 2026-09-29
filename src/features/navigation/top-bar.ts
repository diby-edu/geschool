import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission } from '@/lib/permissions';
import { signAvatarUrls } from '@/lib/storage/avatars';
import { unreadCount } from '@/features/communication/inbox';
import { HUB_PERMISSIONS } from '@/features/settings/hub';
import type { TopBarData } from '@/components/layout/TopBar';

/** Droits qui ouvrent la recherche : on ne cherche que ce qu'on a le droit de voir. */
export const SEARCH_PERMISSIONS = ['students.view', 'teachers.view', 'users.view'] as const;

/** Données de la barre du haut : école, jour, années scolaires, recherche, notifications, photo. */
export async function loadTopBar(ctx: TenantContext, roleLabel: string): Promise<TopBarData> {
  const supabase = await createClient();
  const [{ data: years }, unread, photo] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', ctx.school.id).order('starts_on', { ascending: false }),
    unreadCount(ctx),
    loadOwnPhoto(ctx),
  ]);

  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ctx.school.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return {
    slug: ctx.school.slug,
    schoolName: ctx.school.shortName ?? ctx.school.name,
    dateLabel,
    years: (years ?? []).map((y) => ({ id: y.id, name: y.name, isCurrent: y.is_current })),
    yearId: ctx.academicYear?.id ?? null,
    yearIsCurrent: ctx.academicYear?.isCurrent !== false,
    canSearch: hasAnyPermission(ctx, [...SEARCH_PERMISSIONS]),
    unreadNotifications: unread,
    settingsHref: hasAnyPermission(ctx, HUB_PERMISSIONS) ? `/e/${ctx.school.slug}/parametres` : null,
    yearsHref: hasAnyPermission(ctx, ['academic_years.view']) ? `/e/${ctx.school.slug}/academic-years` : null,
    user: { displayName: ctx.user.displayName, roleLabel, photoUrl: photo },
  };
}

/** Photo de profil de la personne connectée : chemin en base, URL signée à la lecture. */
async function loadOwnPhoto(ctx: TenantContext): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('users').select('avatar_url').eq('id', ctx.user.id).maybeSingle();
  const path = data?.avatar_url ?? null;
  if (!path) return null;
  return (await signAvatarUrls([path])).get(path) ?? null;
}
