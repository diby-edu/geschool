import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { NotFoundError, UnauthenticatedError } from '@/lib/errors';
import type { RoleCode } from '@/lib/permissions/roles';
import { personName } from '@/lib/person-name';

/** Reponse de public.app_context (migration 0057) ; null = non connecte ou session coupee. */
type AppContextRow = {
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    must_change_password: boolean;
  };
  is_platform_admin: boolean;
  school: {
    id: string;
    slug: string;
    name: string;
    short_name: string | null;
    status: string;
    logo_url: string | null;
    primary_color: string | null;
    locale: string;
    timezone: string;
    country_code: string;
    login_code: string;
  } | null;
  academic_year?: { id: string; name: string } | null;
  membership_id?: string | null;
  roles?: string[];
  permissions?: string[];
  disabled_features?: string[];
};

/** Nom affichable : NOM Prénoms comme dans les listes (lib/person-name.ts), sinon l'email. */
function resolveDisplayName(user: AppContextRow['user']): string {
  return personName(user, user.email ?? 'Utilisateur');
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
    /** Code ecole de connexion (6 chiffres), a communiquer aux enseignants et aux parents. */
    loginCode: string;
  };
  /**
    * Année de travail : l'année COURANTE de l'établissement, ou celle choisie dans
    * la barre du haut (cookie par établissement). `isCurrent` dit si c'est bien
    * l'année en cours ; `status` permet d'annoncer une année clôturée (lecture seule,
    * la base refuse déjà les écritures).
    */
  academicYear: { id: string; name: string; status?: string; isCurrent?: boolean } | null;
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
  /**
   * Modules coupés pour cet établissement (migration 0070). Vide presque
   * toujours : un module absent de cette liste est actif.
   */
  disabledFeatures: ReadonlySet<string>;
};

/**
 * UN seul appel a la base (public.app_context, migration 0057) au lieu de trois
 * allers-retours enchaines (getUser, etablissement, puis roles/permissions/annee/
 * appartenance) : la base est distante, chacun coutait 150 a 250 ms.
 *
 * La fonction applique les memes regles qu'avant : etablissement visible s'il y a
 * appartenance active ou Super Admin (sinon 404), et session toujours ouverte
 * (un acces suspendu est coupe tout de suite, comme le faisait getUser()).
 * Appelee en GET : transaction en lecture seule, et relancee sans risque sur une
 * connexion neuve si le reseau la perd (limited-fetch.ts).
 *
 * `cache()` de React deduplique l'appel sur toute la duree d'un rendu : une
 * seule requete par requete HTTP, meme si vingt composants l'utilisent.
 */
export const getTenantContext = cache(async (slug: string): Promise<TenantContext> => {
  const supabase = await createClient();

  const { data, error, status } = await supabase.rpc(
    'app_context' as never,
    { p_slug: slug } as never,
    { get: true },
  );
  // Jeton refuse ou expire : non connecte. Toute autre erreur (reseau, base) est
  // une vraie panne, a ne pas confondre avec « introuvable » ni « deconnecte ».
  if (error) {
    if (status === 401) throw new UnauthenticatedError();
    throw new Error(`Contexte d'établissement indisponible : ${error.message}`);
  }

  const row = data as AppContextRow | null;
  if (!row) throw new UnauthenticatedError();
  const { user, school } = row;
  if (!school) throw new NotFoundError();

  const roles = (row.roles ?? []) as RoleCode[];

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
      loginCode: school.login_code,
    },
    academicYear: await resolveWorkingYear(supabase, slug, school.id, row.academic_year),
    user: {
      id: user.id,
      displayName: resolveDisplayName(user),
      email: user.email ?? '',
      mustChangePassword: user.must_change_password === true,
    },
    isPlatformAdmin: row.is_platform_admin === true,
    membership: row.membership_id ? { id: row.membership_id, roles } : null,
    permissions: new Set(row.permissions ?? []),
    disabledFeatures: new Set(row.disabled_features ?? []),
  };
});

/** Nom du cookie qui retient l'année consultée pour cet établissement. */
export const yearCookieName = (slug: string) => `gs-year-${slug}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Année de travail : celle choisie dans la barre du haut si elle appartient à
 * l'établissement, sinon l'année courante. Un choix devenu invalide (année
 * supprimée, autre établissement) est simplement ignoré.
 */
async function resolveWorkingYear(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
  schoolId: string,
  current: { id: string; name: string } | null | undefined,
): Promise<TenantContext['academicYear']> {
  const chosen = (await cookies()).get(yearCookieName(slug))?.value;
  if (chosen && UUID.test(chosen) && chosen !== current?.id) {
    const { data } = await supabase
      .from('academic_years')
      .select('id, name, status')
      .eq('school_id', schoolId)
      .eq('id', chosen)
      .maybeSingle();
    if (data) return { id: data.id, name: data.name, status: data.status, isCurrent: false };
  }
  return current ? { id: current.id, name: current.name, status: 'ACTIVE', isCurrent: true } : null;
}
