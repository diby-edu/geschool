import 'server-only';

import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';
import { activityLabel } from '@/lib/audit/labels';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Espace Super Admin : ce qui se pilote au-dessus des établissements.
 *
 * Toutes les lectures passent par le client RLS : `app.is_platform_admin()`
 * lève déjà le cloisonnement dans chaque politique (ADR-007). Aucun client
 * privilégié ici — les comptes se lisent dans `public.users`, qui reflète
 * `auth.users` (migration 0003).
 */

export async function requireAdmin(): Promise<{ userId: string }> {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthorizationError();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) throw new AuthorizationError('Reserve aux administrateurs de la plateforme.');
  return { userId: user.id };
}

// --- Établissements ----------------------------------------------------------

export type SchoolAdminRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  createdAt: string;
  students: number;
  teachers: number;
  members: number;
  /** Modules coupés pour cette école : une formule réduite, ou un incident. */
  disabledModules: number;
  subscription: { plan: string; status: string; endsOn: string | null; trialEndsOn: string | null } | null;
};

/** La liste des écoles avec ce qui compte pour la plateforme : taille et abonnement. */
export async function listSchoolsForAdmin(): Promise<SchoolAdminRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: schools }, { data: students }, { data: teachers }, { data: members }, { data: subs }, { data: off }] =
    await Promise.all([
      supabase.from('schools').select('id, slug, name, status, city, created_at').order('name'),
      supabase.from('students').select('school_id').is('deleted_at', null),
      supabase.from('teachers').select('school_id').is('deleted_at', null),
      supabase.from('school_memberships').select('school_id').eq('status', 'ACTIVE'),
      supabase
        .from('subscriptions')
        .select('school_id, status, current_period_end, trial_ends_at, plans(name)')
        .in('status', ['ACTIVE', 'TRIALING', 'PAST_DUE']),
      // La base ne garde que les modules COUPÉS (0070) : une ligne = un module en moins.
      supabase.from('school_features').select('school_id').eq('is_enabled', false),
    ]);

  const count = (rows: { school_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.school_id, (m.get(r.school_id) ?? 0) + 1);
    return m;
  };
  const studentsBySchool = count(students as { school_id: string }[] | null);
  const teachersBySchool = count(teachers as { school_id: string }[] | null);
  const membersBySchool = count(members as { school_id: string }[] | null);
  const offBySchool = count(off as { school_id: string }[] | null);
  const subBySchool = new Map(
    ((subs ?? []) as unknown as {
      school_id: string;
      status: string;
      current_period_end: string | null;
      trial_ends_at: string | null;
      plans: { name: string } | null;
    }[]).map((s) => [
      s.school_id,
      { plan: s.plans?.name ?? '—', status: s.status, endsOn: s.current_period_end, trialEndsOn: s.trial_ends_at },
    ]),
  );

  return ((schools ?? []) as {
    id: string;
    slug: string;
    name: string;
    status: string;
    city: string | null;
    created_at: string;
  }[]).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    status: s.status,
    city: s.city,
    createdAt: s.created_at,
    students: studentsBySchool.get(s.id) ?? 0,
    teachers: teachersBySchool.get(s.id) ?? 0,
    members: membersBySchool.get(s.id) ?? 0,
    disabledModules: offBySchool.get(s.id) ?? 0,
    subscription: subBySchool.get(s.id) ?? null,
  }));
}

export type SchoolStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/**
 * Change l'état d'un établissement. SUSPENDED coupe toute écriture dans son
 * espace (la base le vérifie déjà via `app.school_is_writable`) sans rien
 * supprimer : l'école retrouve ses données à la réactivation.
 */
export async function setSchoolStatus(schoolId: string, status: SchoolStatus, reason: string): Promise<void> {
  const { userId } = await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase.from('schools').select('id, name, status').eq('id', schoolId).maybeSingle();
  if (!before) throw new NotFoundError('Établissement introuvable.');
  if (before.status === status) return;

  const { error } = await supabase.from('schools').update({ status }).eq('id', schoolId);
  if (error) throw error;

  await auditPlatform(userId, {
    action: 'platform.school_status',
    module: 'platform',
    entityType: 'school',
    entityId: schoolId,
    schoolId,
    before: { status: before.status },
    after: { status, reason: reason || null },
  });
}

// --- Paiements déclarés ------------------------------------------------------

export type DeclaredPayment = {
  id: string;
  schoolId: string;
  schoolName: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  createdAt: string;
};

/** Les paiements déclarés par les écoles, en attente de confirmation (0058). */
export async function listPayments(status: 'PENDING' | 'ALL' = 'PENDING'): Promise<DeclaredPayment[]> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from('payments')
    .select('id, school_id, amount, currency, method, provider_reference, status, created_at, schools(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status === 'PENDING') q = q.eq('status', 'PENDING');
  const { data } = await q;

  return ((data ?? []) as unknown as {
    id: string;
    school_id: string;
    amount: number;
    currency: string;
    method: string;
    provider_reference: string | null;
    status: string;
    created_at: string;
    schools: { name: string } | null;
  }[]).map((p) => ({
    id: p.id,
    schoolId: p.school_id,
    schoolName: p.schools?.name ?? '—',
    amount: Number(p.amount),
    currency: p.currency,
    method: p.method,
    reference: p.provider_reference,
    status: p.status,
    createdAt: p.created_at,
  }));
}

// --- Administrateurs de la plateforme ---------------------------------------

export type PlatformAdminRow = {
  userId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  grantedAt: string;
  revokedAt: string | null;
  note: string | null;
};

export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from('platform_admins')
    .select('user_id, is_active, granted_at, revoked_at, note')
    .order('granted_at', { ascending: false });

  const rows = (data ?? []) as {
    user_id: string;
    is_active: boolean;
    granted_at: string;
    revoked_at: string | null;
    note: string | null;
  }[];
  if (rows.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, auth_email, display_name, first_name, last_name')
    .in('id', rows.map((r) => r.user_id));
  const byId = new Map(
    ((users ?? []) as {
      id: string;
      auth_email: string;
      display_name: string | null;
      first_name: string;
      last_name: string;
    }[]).map((u) => [u.id, u]),
  );

  return rows.map((r) => {
    const u = byId.get(r.user_id);
    const full = u ? `${u.last_name.toUpperCase()} ${u.first_name}`.trim() : '';
    return {
      userId: r.user_id,
      email: u?.auth_email ?? '—',
      displayName: u?.display_name || full || u?.auth_email || 'Administrateur',
      isActive: r.is_active,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at,
      note: r.note,
    };
  });
}

/** Donne les droits plateforme à un compte existant, par son e-mail. */
export async function grantPlatformAdmin(email: string, note: string): Promise<void> {
  const { userId } = await requireAdmin();
  const clean = email.trim().toLowerCase();
  if (!clean) throw new ValidationError('E-mail requis.');

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('users')
    .select('id')
    .ilike('auth_email', clean)
    .maybeSingle();
  if (!target) {
    throw new ValidationError(
      'Aucun compte avec cet e-mail. La personne doit d’abord avoir un compte sur la plateforme.',
    );
  }

  const { error } = await supabase.from('platform_admins').upsert(
    { user_id: target.id, is_active: true, revoked_at: null, granted_by: userId, note: note || null },
    { onConflict: 'user_id' },
  );
  if (error) throw error;

  await auditPlatform(userId, {
    action: 'platform.admin_grant',
    module: 'platform',
    entityType: 'user',
    entityId: target.id,
    after: { email: clean, note: note || null },
  });
}

/** Retire les droits plateforme. On garde la ligne : l'historique compte. */
export async function revokePlatformAdmin(targetUserId: string): Promise<void> {
  const { userId } = await requireAdmin();
  if (targetUserId === userId) {
    throw new ValidationError('Vous ne pouvez pas retirer vos propres droits : demandez à un autre administrateur.');
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('platform_admins')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('user_id', targetUserId);
  if (error) throw error;

  await auditPlatform(userId, {
    action: 'platform.admin_revoke',
    module: 'platform',
    entityType: 'user',
    entityId: targetUserId,
  });
}

// --- Journal global ----------------------------------------------------------

export type GlobalAuditRow = {
  id: string;
  label: string;
  schoolName: string | null;
  module: string;
  at: string;
  byPlatform: boolean;
};

export async function listGlobalAudit(schoolId?: string): Promise<GlobalAuditRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from('audit_logs')
    .select('id, action, module, created_at, actor_is_platform_admin, schools(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q;

  return ((data ?? []) as unknown as {
    id: string;
    action: string;
    module: string;
    created_at: string;
    actor_is_platform_admin: boolean;
    schools: { name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    label: activityLabel(r.action, r.module).label,
    schoolName: r.schools?.name ?? null,
    module: r.module,
    at: r.created_at,
    byPlatform: r.actor_is_platform_admin,
  }));
}
