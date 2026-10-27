import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateTempPassword } from '@/lib/sms';
import { ConflictError } from '@/lib/errors';

/**
 * Compte d'un nouvel administrateur de la plateforme (demandé le 2026-10-25 :
 * « créer un autre compte Super Admin » depuis une page dédiée).
 *
 * Seul un Super Admin déjà connecté y arrive (features/platform/admin.ts vérifie
 * le droit avant). Un compte neuf reçoit un mot de passe temporaire, montré UNE
 * fois à celui qui le crée pour le remettre en main propre, et
 * must_change_password : à la première connexion, la personne choisit le sien.
 * Si l'e-mail a déjà un compte, on ne touche ni à son mot de passe ni à son nom.
 */
export async function findOrCreateAdminAccount(input: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ userId: string; tempPassword: string | null }> {
  const admin = createAdminClient('auth.create_user');

  const { data: existing } = await admin.from('users').select('id').ilike('auth_email', input.email).maybeSingle();
  if (existing) return { userId: existing.id as string, tempPassword: null };

  const tempPassword = generateTempPassword(12);
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      display_name: `${input.firstName} ${input.lastName}`,
      first_name: input.firstName,
      last_name: input.lastName,
    },
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || /already.*registered|already.*exists/i.test(error?.message ?? '')) {
      throw new ConflictError('Un compte existe déjà avec cette adresse e-mail.');
    }
    throw new Error(`createUser: ${error?.message ?? 'inconnu'}`);
  }
  return { userId: data.user.id, tempPassword };
}
