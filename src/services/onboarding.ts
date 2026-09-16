import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/auth/identifier';
import { ConflictError, RateLimitError, ValidationError } from '@/lib/errors';

/**
 * Orchestration de l'inscription en libre-service d'un etablissement (wizard
 * public /inscription). Meme esprit que services/enrollment.ts::enrollStudent
 * (client service_role, plusieurs ecritures successives, sans transaction
 * multi-instructions) mais pour un cas different : ici, le createur ET le
 * sujet du compte sont la meme personne — elle choisit son propre mot de
 * passe et n'a besoin d'aucune activation differee (contrairement aux comptes
 * eleve/parent, crees avec un secret jetable et NOT_ACTIVATED).
 */

export type EducationTrack = 'GENERAL' | 'TECHNIQUE' | 'PROFESSIONNEL';
export type ModuleCode = 'SCOL' | 'APPEL';

export type RegisterSchoolInput = {
  ipAddress: string;
  school: {
    name: string;
    city: string;
    neighborhood: string;
    /** null = case "je n'ai pas de code" cochee : un code provisoire est genere. */
    registrationNumber: string | null;
    educationTracks: EducationTrack[];
    logo: File | null;
  };
  modules: ModuleCode[];
  parentPortalEnabled: boolean;
  director: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
  };
};

export type RegisterSchoolResult = { schoolId: string; slug: string; userId: string };

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PROVISIONAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caracteres ambigus (0/O, 1/I)

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 38);
}

function randomProvisionalCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += PROVISIONAL_CODE_CHARS[Math.floor(Math.random() * PROVISIONAL_CODE_CHARS.length)];
  return `PROVISOIRE-${out}`;
}

export async function registerSchool(input: RegisterSchoolInput): Promise<RegisterSchoolResult> {
  const admin = createAdminClient('onboarding.self_register');

  // 1. Anti-abus : 5 inscriptions / heure / IP. La tentative est enregistree
  // AVANT toute creation, pour compter meme un echec de validation ulterieur.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from('onboarding_signup_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', input.ipAddress)
    .gt('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    throw new RateLimitError(3600, "Trop de tentatives d'inscription depuis cette adresse. Reessayez dans une heure.");
  }
  await admin.from('onboarding_signup_attempts').insert({ ip_address: input.ipAddress });

  const phone = normalizePhone(input.director.phone, 'CI');
  if (!phone) throw new ValidationError('Numero de telephone invalide.');

  // 2. Compte Auth du directeur EN PREMIER (avant toute ecriture persistante
  // liee a l'ecole) : c'est le point d'echec le plus probable (email deja
  // utilise) et il ne laisse rien a nettoyer s'il echoue ici.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.director.email,
    password: input.director.password,
    email_confirm: true,
    user_metadata: {
      display_name: `${input.director.firstName} ${input.director.lastName}`,
      first_name: input.director.firstName,
      last_name: input.director.lastName,
    },
    app_metadata: { must_change_password: false },
  });
  if (authError || !authData.user) {
    if (authError?.code === 'email_exists' || /already.*registered|already.*exists/i.test(authError?.message ?? '')) {
      throw new ConflictError('Un compte existe deja avec cette adresse email.');
    }
    throw new Error(`createUser: ${authError?.message ?? 'inconnu'}`);
  }
  const userId = authData.user.id;

  let createdSchoolId: string | null = null;
  try {
    // 3. École — slug derive du nom, avec reprise sur collision.
    const base = slugify(input.school.name) || 'etablissement';
    const registrationNumber = input.school.registrationNumber?.trim() || randomProvisionalCode();
    let schoolRow: { id: string; slug: string } | null = null;
    for (let attempt = 0; attempt < 20 && !schoolRow; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await admin
        .from('schools')
        .insert({
          name: input.school.name,
          slug,
          status: 'ACTIVE', // sinon requireWritable() bloque tout dans la nouvelle ecole
          city: input.school.city,
          neighborhood: input.school.neighborhood,
          registration_number: registrationNumber,
          education_tracks: input.school.educationTracks,
          parent_portal_enabled: input.parentPortalEnabled,
          country_code: 'CI',
          currency: 'XOF',
          locale: 'fr-CI',
          timezone: 'Africa/Abidjan',
        })
        .select('id, slug')
        .single();
      if (!error) { schoolRow = data; break; }
      if (error.code !== '23505') throw error;
    }
    if (!schoolRow) throw new ValidationError("Impossible d'attribuer une adresse a cet etablissement.");
    const schoolId = schoolRow.id;
    const slug = schoolRow.slug;
    createdSchoolId = schoolId;

    // 4. Logo (optionnel, non bloquant).
    if (input.school.logo) {
      try {
        const ext = input.school.logo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `schools/${schoolId}/branding/logo.${ext}`;
        const { error: uploadError } = await admin.storage
          .from('avatars')
          .upload(path, input.school.logo, { upsert: true, contentType: input.school.logo.type });
        if (!uploadError) await admin.from('schools').update({ logo_url: path }).eq('id', schoolId);
      } catch (e) {
        console.error('[onboarding] logo upload failed', e);
      }
    }

    // 5. Rattachement du directeur : membership + role systeme.
    await admin.from('school_memberships').insert({ school_id: schoolId, user_id: userId, status: 'ACTIVE' });
    await grantRole(admin, schoolId, userId, 'SCHOOL_ADMIN');

    // 6. Acces — deja actif : le directeur vient de choisir son propre mot de
    // passe, aucune activation differee necessaire (contrairement aux comptes
    // eleve/parent crees par un tiers).
    await admin.from('account_access').insert({
      school_id: schoolId,
      user_id: userId,
      subject_kind: 'STAFF',
      login_kind: 'EMAIL',
      login_identifier: input.director.email.toLowerCase(),
      account_status: 'ACTIVE',
      activation_status: 'ACTIVATED',
      must_change_password: false,
      activated_at: new Date().toISOString(),
    });
    await admin.from('access_events').insert({
      school_id: schoolId, user_id: userId, event_type: 'ACCOUNT_CREATED', actor_id: userId,
    });

    // 7. Essai gratuit 30 jours + modules choisis (a la carte : plan_id null).
    const { data: subscription, error: subError } = await admin
      .from('subscriptions')
      .insert({
        school_id: schoolId,
        plan_id: null,
        status: 'TRIALING',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    if (subError) throw subError;

    const { data: moduleRows } = await admin.from('modules').select('id, code').in('code', input.modules);
    if (moduleRows && moduleRows.length > 0) {
      await admin.from('subscription_modules').insert(
        moduleRows.map((m) => ({ school_id: schoolId, subscription_id: subscription.id, module_id: m.id })),
      );
    }

    // 8. Audit — pas auditPlatform() : elle force a tort actor_is_platform_admin.
    await admin.from('audit_logs').insert({
      school_id: schoolId,
      actor_user_id: userId,
      actor_is_platform_admin: false,
      actor_role: 'SCHOOL_ADMIN',
      action: 'onboarding.self_register',
      module: 'onboarding',
      entity_type: 'school',
      entity_id: schoolId,
      after: { slug, name: input.school.name, modules: input.modules, parentPortalEnabled: input.parentPortalEnabled },
    });

    return { schoolId, slug, userId };
  } catch (error) {
    // Nettoyage best-effort : ne jamais laisser un compte Auth ou une ecole
    // orpheline (sans membership complet) trainer si une etape a echoue en
    // cours de route. Supprimer schools cascade membership/roles/account_access/
    // subscriptions/subscription_modules ; le compte Auth doit etre supprime a part.
    if (createdSchoolId) {
      try {
        await admin.from('schools').delete().eq('id', createdSchoolId);
      } catch {
        // best-effort
      }
    }
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw error;
  }
}

async function grantRole(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  userId: string,
  roleCode: string,
): Promise<void> {
  const { data: membership } = await admin
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return;
  const { data: role } = await admin
    .from('roles')
    .select('id')
    .is('school_id', null)
    .eq('code', roleCode)
    .maybeSingle();
  if (!role) return;
  await admin
    .from('membership_roles')
    .upsert({ membership_id: membership.id, role_id: role.id }, { onConflict: 'membership_id,role_id', ignoreDuplicates: true });
}
