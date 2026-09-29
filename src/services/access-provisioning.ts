import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Provisionnement d'un acces par telephone (enseignant, parent).
 *
 * REGLE : une personne = un acces par etablissement = un mot de passe, avec
 * plusieurs roles possibles. La base l'impose (un identifiant ne sert qu'a un
 * seul acces par ecole ; membership_roles autorise le cumul de roles). Toute
 * creation d'acces par telephone passe donc par ici : si le numero a deja un
 * acces dans l'ecole (un enseignant qui devient parent, ou l'inverse), on lui
 * AJOUTE le role au lieu de creer un second compte — qui serait rejete par la
 * base et laisserait une inscription a moitie faite.
 *
 * Client service_role (creation de comptes Auth). Un compte neuf recoit un mot
 * de passe aleatoire jete et must_change_password = true : le vrai secret
 * temporaire n'est genere qu'a l'envoi (ADR-006).
 */

type Admin = ReturnType<typeof createAdminClient>;

export type AccessRole = 'TEACHER' | 'PARENT';
export type AccessSubjectKind = 'TEACHER' | 'GUARDIAN' | 'STAFF';

export type PhoneAccessInput = {
  /** Numero deja normalise (E.164). */
  phone: string;
  firstName: string;
  lastName: string;
  /**
   * Role accorde ICI, avec le client service_role. `null` = aucun : l'appelant
   * attribue les fonctions lui-meme avec les droits de l'utilisateur (personnel
   * administratif), pour que les garde-fous de la base — pas d'auto-promotion —
   * s'appliquent a chaque attribution.
   */
  role: AccessRole | null;
  subjectKind: AccessSubjectKind;
};

export type PhoneAccessResult = {
  userId: string;
  /** true = compte neuf ; false = le numero avait deja un acces, le role a ete ajoute. */
  created: boolean;
  /** Envoi d'identifiants en attente (compte neuf uniquement). */
  deliveryId: string | null;
  /** Nature de l'acces existant quand le numero en avait un. */
  existingKind: string | null;
  /** L'acces existant est-il deja active (mot de passe personnel choisi) ? */
  existingActivated: boolean;
};

/** Cree un compte Auth a email technique et mot de passe aleatoire jete. */
async function createThrowawayAccount(admin: Admin, meta: Record<string, string>): Promise<string> {
  const email = `p.${crypto.randomUUID()}@${serverEnv().AUTH_SYNTHETIC_EMAIL_DOMAIN}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: meta,
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? 'inconnu'}`);
  return data.user.id;
}

/** Ajoute une fonction (role) a un membre de l'ecole (idempotent). */
export async function grantRole(admin: Admin, schoolId: string, userId: string, roleCode: string): Promise<void> {
  const { data: membership } = await admin
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return;
  // La fonction PROPRE a l'etablissement si elle existe (droits reglables, migration
  // 0050), sinon le modele systeme. Sans cela, un enseignant cree apres la
  // personnalisation garderait les droits du modele et non ceux de l'ecole.
  const { data: candidates } = await admin
    .from('roles')
    .select('id, school_id')
    .eq('code', roleCode)
    .or(`school_id.eq.${schoolId},school_id.is.null`);
  const role = candidates?.find((r) => r.school_id === schoolId) ?? candidates?.find((r) => r.school_id === null);
  if (!role) return;
  await admin
    .from('membership_roles')
    .upsert({ membership_id: membership.id, role_id: role.id }, { onConflict: 'membership_id,role_id', ignoreDuplicates: true });
}

async function ensureMembership(admin: Admin, schoolId: string, userId: string): Promise<void> {
  const { data } = await admin
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return;
  const { error } = await admin.from('school_memberships').insert({ school_id: schoolId, user_id: userId, status: 'ACTIVE' });
  if (error) throw error;
}

export async function findOrCreatePhoneAccess(
  ctx: TenantContext,
  input: PhoneAccessInput,
  attempt = 0,
): Promise<PhoneAccessResult> {
  const admin = createAdminClient('auth.create_user');
  const schoolId = ctx.school.id;

  const { data: existing } = await admin
    .from('account_access')
    .select('user_id, subject_kind, activation_status')
    .eq('school_id', schoolId)
    .eq('login_identifier', input.phone)
    .maybeSingle();

  if (existing) {
    await ensureMembership(admin, schoolId, existing.user_id);
    if (input.role) await grantRole(admin, schoolId, existing.user_id, input.role);
    return {
      userId: existing.user_id,
      created: false,
      deliveryId: null,
      existingKind: existing.subject_kind,
      existingActivated: existing.activation_status === 'ACTIVATED',
    };
  }

  const userId = await createThrowawayAccount(admin, {
    display_name: `${input.firstName} ${input.lastName}`,
    first_name: input.firstName,
    last_name: input.lastName,
  });

  try {
    await ensureMembership(admin, schoolId, userId);
    if (input.role) await grantRole(admin, schoolId, userId, input.role);

    const { error: accessError } = await admin.from('account_access').insert({
      school_id: schoolId,
      user_id: userId,
      subject_kind: input.subjectKind,
      login_kind: 'PHONE',
      login_identifier: input.phone,
      account_status: 'CREATED',
      activation_status: 'NOT_ACTIVATED',
      must_change_password: true,
      created_by: ctx.user.id,
    });
    if (accessError) throw accessError;

    await admin.from('access_events').insert({
      school_id: schoolId,
      user_id: userId,
      event_type: 'ACCOUNT_CREATED',
      actor_id: ctx.user.id,
    });

    const { data: delivery, error: deliveryError } = await admin
      .from('credential_deliveries')
      .insert({
        school_id: schoolId,
        user_id: userId,
        reason: 'INITIAL',
        channel: 'SMS',
        recipient: input.phone,
        status: 'PENDING',
        idempotency_key: `initial-${userId}`,
      })
      .select('id')
      .single();
    if (deliveryError) throw deliveryError;

    return { userId, created: true, deliveryId: delivery.id, existingKind: null, existingActivated: false };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    // Course : deux creations simultanees du meme numero. Le perdant n'a rien a
    // creer, il rejoint l'acces du gagnant.
    if ((error as { code?: string }).code === '23505' && attempt === 0) {
      return findOrCreatePhoneAccess(ctx, input, 1);
    }
    throw error;
  }
}
