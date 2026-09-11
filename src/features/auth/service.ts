import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import { serverEnv } from '@/lib/env';

/**
 * Resolution d'un identifiant d'etablissement (telephone, matricule, email)
 * vers l'email Auth synthetique (ADR-005).
 *
 * S'execute AVANT authentification : elle passe par le client service_role et
 * la fonction app.resolve_login_email (SECURITY DEFINER, migration 0031).
 * Elle ne revele jamais l'existence d'un compte a l'appelant — c'est l'action
 * de connexion qui garantit une reponse generique et une tentative meme sur
 * echec de resolution (anti-enumeration).
 */
export async function resolveAuthEmail(
  schoolId: string,
  rawIdentifier: string,
  countryCode: string,
): Promise<string | null> {
  const normalized = normalizeIdentifier(rawIdentifier, countryCode);
  if (!normalized.ok) return null;

  const admin = createAdminClient('auth.resolve_login');
  const { data, error } = await admin.rpc('resolve_login_email' as never, {
    p_school: schoolId,
    p_identifier: normalized.value,
  } as never);

  if (error) {
    console.error('[auth] resolution echouee', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Recupere l'id et le pays d'un etablissement a partir de son slug, hors
 * session (page de connexion). Lecture publique limitee au strict necessaire.
 */
export async function resolveSchoolBySlug(
  slug: string,
): Promise<{ id: string; name: string; countryCode: string; logoUrl: string | null } | null> {
  const admin = createAdminClient('auth.resolve_login');
  const { data } = await admin
    .from('schools')
    .select('id, name, country_code, logo_url, status')
    .eq('slug', slug)
    .maybeSingle();

  if (!data || data.status === 'ARCHIVED') return null;
  return { id: data.id, name: data.name, countryCode: data.country_code, logoUrl: data.logo_url };
}

/**
 * Domaine des emails synthetiques, pour reconnaitre un compte parent/eleve
 * d'un compte personnel a email reel.
 */
export function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${serverEnv().AUTH_SYNTHETIC_EMAIL_DOMAIN}`);
}
