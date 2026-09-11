import 'server-only';

import { cache } from 'react';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { NotFoundError, UnauthenticatedError } from '@/lib/errors';
import type { RoleCode } from '@/lib/permissions/roles';
import type { User } from '@supabase/supabase-js';

/** Nom affichable, du plus explicite au plus generique. */
function resolveDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const explicit = meta.display_name as string | undefined;
  if (explicit && explicit.trim() !== '') return explicit;

  const full = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();
  if (full !== '') return full;

  return user.email ?? 'Utilisateur';
}

/**
 * Contexte d'etablissement resolu cote serveur (ARCHITECTURE.md §4).
 *
 * C'est la SEULE source du school_id : un school_id recu du client est ignore,
 * systematiquement. Le slug de l'URL ne fait que DESIGNER l'etablissement ;
 * l'appartenance est verifiee ici, et un non-membre obtient un 404 — jamais un
 * 403, qui confirmerait l'existence de l'etablissement.
 */
export type TenantContext = {
  school: {
    id: string;
    slug: string;
    name: string;
    shortName: string | null;
    status: string;
    logoUrl: string | null;
    primaryColor: string | null;
    locale: string;
    timezone: string;
    countryCode: string;
  };
  academicYear: { id: string; name: string } | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    mustChangePassword: boolean;
  };
  isPlatformAdmin: boolean;
  /** null quand un Super Admin consulte un etablissement dont il n'est pas membre */
  membership: { id: string; roles: RoleCode[] } | null;
  permissions: ReadonlySet<string>;
};

/**
 * `cache()` de React deduplique l'appel sur toute la duree d'un rendu : une
 * seule serie de requetes par requete HTTP, meme si vingt composants
 * l'utilisent.
 */
export const getTenantContext = cache(async (slug: string): Promise<TenantContext> => {
  const user = await getAuthenticatedUser();
  if (!user) throw new UnauthenticatedError();

  const supabase = await createClient();

  // La RLS ne renvoie l'etablissement que s'il est visible : membre actif, ou
  // Super Admin. Un slug inconnu, ou connu mais sans appartenance, renvoie
  // zero ligne -> 404.
  const { data: school } = await supabase
    .from('schools')
    .select('id, slug, name, short_name, status, logo_url, primary_color, locale, timezone, country_code')
    .eq('slug', slug)
    .maybeSingle();

  if (!school) throw new NotFoundError();

  const [{ data: isAdmin }, { data: roleCodes }, { data: permCodes }, { data: year }, { data: membership }] =
    await Promise.all([
      supabase.rpc('is_platform_admin' as never),
      supabase.rpc('my_role_codes' as never, { p_school: school.id } as never),
      supabase.rpc('my_permission_codes' as never, { p_school: school.id } as never),
      supabase
        .from('academic_years')
        .select('id, name')
        .eq('school_id', school.id)
        .eq('is_current', true)
        .maybeSingle(),
      supabase
        .from('school_memberships')
        .select('id')
        .eq('school_id', school.id)
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle(),
    ]);

  const roles = ((roleCodes as string[] | null) ?? []) as RoleCode[];

  return {
    school: {
      id: school.id,
      slug: school.slug,
      name: school.name,
      shortName: school.short_name,
      status: school.status,
      logoUrl: school.logo_url,
      primaryColor: school.primary_color,
      locale: school.locale,
      timezone: school.timezone,
      countryCode: school.country_code,
    },
    academicYear: year ? { id: year.id, name: year.name } : null,
    user: {
      id: user.id,
      displayName: resolveDisplayName(user),
      email: user.email ?? '',
      mustChangePassword: user.app_metadata?.must_change_password === true,
    },
    isPlatformAdmin: (isAdmin as boolean | null) ?? false,
    membership: membership ? { id: membership.id, roles } : null,
    permissions: new Set((permCodes as string[] | null) ?? []),
  };
});
