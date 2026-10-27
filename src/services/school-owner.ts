import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateTempPassword } from '@/lib/sms';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { grantRole } from '@/services/access-provisioning';

/**
 * Changer le responsable (fondateur, SCHOOL_ADMIN) d'une école — réservé à
 * l'administration de la plateforme (features/platform/school-sheet.ts vérifie
 * le droit). Décidé le 2026-10-25 :
 *   - vers un membre existant de l'école, ou vers un nouvel e-mail (compte créé
 *     avec un mot de passe temporaire, à changer à la première connexion) ;
 *   - au choix, l'ancien responsable perd le rôle de fondateur ; il garde ses
 *     autres fonctions.
 * Le rôle de fondateur n'est pas une « fonction du personnel » : l'école ne peut
 * pas le donner elle-même, d'où ce service à part (clé de service).
 */

export type OwnerTarget = { userId: string } | { email: string; firstName: string; lastName: string };

export type OwnerTransferResult = {
  userId: string;
  email: string | null;
  /** Mot de passe temporaire d'un compte neuf, à montrer UNE fois ; null sinon. */
  tempPassword: string | null;
  /** Anciens responsables à qui le rôle de fondateur a été retiré. */
  removed: string[];
};

async function founderRoleIds(admin: ReturnType<typeof createAdminClient>, schoolId: string): Promise<string[]> {
  const { data } = await admin.from('roles').select('id').eq('code', 'SCHOOL_ADMIN').or(`school_id.eq.${schoolId},school_id.is.null`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function transferSchoolOwner(schoolId: string, target: OwnerTarget, removeFromOthers: boolean): Promise<OwnerTransferResult> {
  const admin = createAdminClient('auth.create_user');
  let userId: string;
  let email: string | null = null;
  let tempPassword: string | null = null;

  if ('userId' in target) {
    const { data: m } = await admin
      .from('school_memberships')
      .select('id')
      .eq('school_id', schoolId)
      .eq('user_id', target.userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (!m) throw new NotFoundError('Cette personne ne fait pas partie de l’école.');
    userId = target.userId;
  } else {
    email = target.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Adresse e-mail invalide.');
    if (!target.firstName.trim() || !target.lastName.trim()) throw new ValidationError('Prénom et nom requis.');
    const { data: existing } = await admin.from('users').select('id').ilike('auth_email', email).maybeSingle();
    if (existing) {
      userId = existing.id as string;
    } else {
      tempPassword = generateTempPassword(12);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: `${target.firstName.trim()} ${target.lastName.trim()}`,
          first_name: target.firstName.trim(),
          last_name: target.lastName.trim(),
        },
        app_metadata: { must_change_password: true },
      });
      if (error || !data.user) {
        if (error?.code === 'email_exists') throw new ConflictError('Un compte existe déjà avec cette adresse e-mail.');
        throw new Error(`createUser: ${error?.message ?? 'inconnu'}`);
      }
      userId = data.user.id;
    }

    // Membre de l'école, et accès par e-mail (sans quoi la personne ne peut pas entrer).
    const { data: m } = await admin.from('school_memberships').select('id, status').eq('school_id', schoolId).eq('user_id', userId).maybeSingle();
    if (!m) {
      const { error } = await admin.from('school_memberships').insert({ school_id: schoolId, user_id: userId, status: 'ACTIVE' });
      if (error) throw error;
    } else if (m.status !== 'ACTIVE') {
      await admin.from('school_memberships').update({ status: 'ACTIVE' }).eq('id', m.id);
    }
    const { data: access } = await admin.from('account_access').select('id').eq('school_id', schoolId).eq('user_id', userId).maybeSingle();
    if (!access) {
      const { error } = await admin.from('account_access').insert({
        school_id: schoolId,
        user_id: userId,
        subject_kind: 'STAFF',
        login_kind: 'EMAIL',
        login_identifier: email,
        account_status: 'ACTIVE',
        activation_status: tempPassword ? 'NOT_ACTIVATED' : 'ACTIVATED',
        must_change_password: tempPassword !== null,
      });
      if (error) throw error;
    }
  }

  await grantRole(admin, schoolId, userId, 'SCHOOL_ADMIN');

  const removed: string[] = [];
  if (removeFromOthers) {
    const roleIds = await founderRoleIds(admin, schoolId);
    const { data: others } = await admin
      .from('membership_roles')
      .select('membership_id, school_memberships!inner(user_id, school_id)')
      .in('role_id', roleIds)
      .eq('school_memberships.school_id', schoolId);
    for (const o of (others ?? []) as unknown as { membership_id: string; school_memberships: { user_id: string } }[]) {
      if (o.school_memberships.user_id === userId) continue;
      const { error } = await admin.from('membership_roles').delete().eq('membership_id', o.membership_id).in('role_id', roleIds);
      if (error) throw error;
      removed.push(o.school_memberships.user_id);
    }
  }

  return { userId, email, tempPassword, removed };
}
