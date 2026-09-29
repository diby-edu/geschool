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
    console.error('[auth] résolution échouée', error.message);
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
 * Etablissement a partir de son code ecole (6 chiffres), hors session : page de
 * connexion unique. Ne renvoie que le strict necessaire a la connexion.
 */
export async function resolveSchoolByCode(
  code: string,
): Promise<{ id: string; slug: string; name: string; countryCode: string } | null> {
  const admin = createAdminClient('auth.resolve_login');
  const { data } = await admin
    .from('schools')
    .select('id, slug, name, country_code, status')
    .eq('login_code', code)
    .maybeSingle();

  if (!data || data.status === 'ARCHIVED') return null;
  return { id: data.id, slug: data.slug, name: data.name, countryCode: data.country_code };
}

/**
 * Domaine des emails synthetiques, pour reconnaitre un compte parent/eleve
 * d'un compte personnel a email reel.
 */
export function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${serverEnv().AUTH_SYNTHETIC_EMAIL_DOMAIN}`);
}
