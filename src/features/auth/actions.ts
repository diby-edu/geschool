'use server';

import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import {
  emailLoginSchema,
  schoolLoginSchema,
  firstLoginSchema,
  passwordResetRequestSchema,
} from './schemas';
import { resolveAuthEmail, resolveSchoolBySlug } from './service';

/**
 * Etat renvoye a un formulaire (useActionState) EN CAS D'ERREUR seulement.
 * En cas de succes, l'action redirige cote serveur (redirect()) : Next vide
 * les cookies de session avant d'emettre la redirection, et le navigateur la
 * suit automatiquement. Une redirection cote client (useEffect + router) s'est
 * averee non fiable — elle ne suivait pas la redirection serveur en cascade
 * de la racine.
 */
export type AuthState = { error?: string };

const GENERIC = 'Identifiant ou mot de passe incorrect.';

function safeNext(next: unknown): string {
  // N'accepte qu'un chemin interne, jamais une URL absolue (open redirect)
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

// ---------------------------------------------------------------------------
// Connexion par email (personnel, Super Admin)
// ---------------------------------------------------------------------------

export async function loginWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailLoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: GENERIC };

  redirect(safeNext(parsed.data.next));
}

// ---------------------------------------------------------------------------
// Connexion par identifiant d'etablissement (parent, eleve, personnel)
// ---------------------------------------------------------------------------

export async function loginWithSchoolIdentifier(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = schoolLoginSchema.safeParse({
    slug: formData.get('slug'),
    identifier: formData.get('identifier'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }

  const school = await resolveSchoolBySlug(parsed.data.slug);
  if (!school) return { error: GENERIC };

  const authEmail = await resolveAuthEmail(school.id, parsed.data.identifier, school.countryCode);

  const supabase = await createClient();
  // Anti-enumeration : sur echec de resolution, on tente quand meme une
  // connexion avec un email inexistant. Le temps de reponse et le message
  // restent identiques, qu'un compte existe ou non.
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail ?? `inconnu-${crypto.randomUUID()}@${'accounts.invalid'}`,
    password: parsed.data.password,
  });
  if (error || !authEmail) return { error: GENERIC };

  redirect(`/e/${parsed.data.slug}`);
}

// ---------------------------------------------------------------------------
// Premiere connexion : definition du mot de passe personnel (ADR-006)
// ---------------------------------------------------------------------------

export async function completeFirstLogin(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = firstLoginSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }

  const user = await getAuthenticatedUser();
  if (!user) return { error: 'Session expiree. Veuillez vous reconnecter.' };

  // 1. Nouveau secret via la session de l'utilisateur
  const supabase = await createClient();
  const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pwError) {
    return {
      error:
        pwError.message.includes('should be different') || pwError.message.includes('different from')
          ? 'Choisissez un mot de passe different de celui recu.'
          : 'Impossible de definir le mot de passe. Reessayez.',
    };
  }

  // 2. Lever le drapeau global (JWT) et refleter dans account_access.
  //    Le service_role est necessaire : app_metadata n'est modifiable que par
  //    l'Admin API, et account_access.must_change_password n'est pas
  //    modifiable par le sujet lui-meme au-dela de ce cas.
  const admin = createAdminClient('auth.update_password');
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  await admin
    .from('account_access')
    .update({
      must_change_password: false,
      activation_status: 'ACTIVATED',
      account_status: 'ACTIVE',
      activated_at: new Date().toISOString(),
      last_password_change_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('must_change_password', true);

  // 3. Historique (access_events) pour chaque etablissement du compte
  const { data: accesses } = await admin
    .from('account_access')
    .select('school_id')
    .eq('user_id', user.id);
  if (accesses) {
    await admin.from('access_events').insert(
      accesses.map((a) => ({
        school_id: a.school_id,
        user_id: user.id,
        event_type: 'ACCOUNT_ACTIVATED' as const,
        actor_id: user.id,
      })),
    );
  }

  // La session porte encore l'ancien app_metadata ; on la rafraichit pour que
  // le middleware ne renvoie plus vers /first-login (le nouveau JWT reflete
  // must_change_password = false).
  await supabase.auth.refreshSession();

  redirect('/');
}

// ---------------------------------------------------------------------------
// Mot de passe oublie (personnel a email reel uniquement)
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get('email') });
  // Reponse toujours identique : ne jamais reveler si l'adresse existe.
  if (!parsed.success) {
    return { error: 'Si cette adresse est connue, un lien vient de vous etre envoye.' };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/first-login`,
  });

  return { error: 'Si cette adresse est connue, un lien vient de vous etre envoye.' };
}

// ---------------------------------------------------------------------------
// Deconnexion
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
