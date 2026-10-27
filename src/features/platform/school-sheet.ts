import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext, type TenantContext } from '@/lib/tenant/context';
import { NotFoundError } from '@/lib/errors';
import { listStaff, type StaffRow } from '@/features/staff/queries';
import { getPlatformCockpit, type SchoolHealth } from '@/features/platform-dashboard/cockpit';
import { requireAdmin, listSchoolsForAdmin, type SchoolAdminRow } from './admin';

/**
 * La fiche complète d'une école, vue par le Super Admin (lot 3, maquette
 * docs/maquettes/super-admin-fiche-ecole.html) : identité, chiffres, santé,
 * abonnement et paiements, personnes.
 *
 * Les écrans de l'école réutilisent le contexte de l'école (getTenantContext)
 * : un administrateur de la plateforme y a tous les droits, et les mêmes règles
 * qu'à l'intérieur de l'école s'appliquent (rien n'est contourné).
 */

export type SchoolSheet = {
  school: {
    id: string;
    slug: string;
    name: string;
    shortName: string | null;
    status: string;
    loginCode: string;
    city: string | null;
    neighborhood: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    directorName: string | null;
    registrationNumber: string | null;
    educationTracks: string[];
    createdAt: string;
    countryCode: string;
  };
  row: SchoolAdminRow | null;
  counts: { classes: number; guardians: number; parentsConnected: number; staff: number };
  health: SchoolHealth | null;
  payments: { paidThisYear: number; lastPaidAt: string | null; currency: string; pending: number };
};

async function headCount(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export async function getSchoolSheet(id: string): Promise<SchoolSheet> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: s } = await supabase
    .from('schools')
    .select(
      'id, slug, name, short_name, status, login_code, city, neighborhood, address, phone_e164, email, website, director_name, registration_number, education_tracks, created_at, country_code',
    )
    .eq('id', id)
    .maybeSingle();
  if (!s) throw new NotFoundError('École introuvable.');

  const today = new Date();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear() - (today.getUTCMonth() >= 8 ? 0 : 1), 8, 1)).toISOString().slice(0, 10);

  const [all, cockpit, classes, guardians, parentsConnected, staff, paid, pending] = await Promise.all([
    listSchoolsForAdmin(),
    getPlatformCockpit(),
    headCount(supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', id)),
    headCount(supabase.from('guardians').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('status', 'ACTIVE')),
    headCount(
      supabase
        .from('account_access')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', id)
        .eq('subject_kind', 'GUARDIAN')
        .eq('activation_status', 'ACTIVATED'),
    ),
    headCount(supabase.from('account_access').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('subject_kind', 'STAFF')),
    supabase.from('payments').select('amount, currency, paid_at').eq('school_id', id).eq('status', 'PAID').gte('paid_at', yearStart).order('paid_at', { ascending: false }),
    headCount(supabase.from('payments').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('status', 'PENDING')),
  ]);
  const paidRows = (paid.data ?? []) as { amount: number | string; currency: string | null; paid_at: string | null }[];

  return {
    school: {
      id: s.id,
      slug: s.slug,
      name: s.name,
      shortName: s.short_name,
      status: s.status,
      loginCode: s.login_code,
      city: s.city,
      neighborhood: s.neighborhood,
      address: s.address,
      phone: s.phone_e164,
      email: s.email,
      website: s.website,
      directorName: s.director_name,
      registrationNumber: s.registration_number,
      educationTracks: (s.education_tracks ?? []) as string[],
      createdAt: s.created_at,
      countryCode: s.country_code,
    },
    row: all.find((x) => x.id === id) ?? null,
    counts: { classes, guardians, parentsConnected, staff },
    health: cockpit.data?.health.find((h) => h.id === id) ?? null,
    payments: {
      paidThisYear: paidRows.reduce((a, p) => a + Number(p.amount), 0),
      lastPaidAt: paidRows[0]?.paid_at ?? null,
      currency: paidRows[0]?.currency ?? 'XOF',
      pending,
    },
  };
}

/** Le contexte de l'école, au nom de l'administrateur de la plateforme. */
export async function platformSchoolContext(slug: string): Promise<TenantContext> {
  await requireAdmin();
  const ctx = await getTenantContext(slug);
  if (!ctx.isPlatformAdmin) throw new NotFoundError('École introuvable.');
  return ctx;
}

export async function listSchoolPeople(slug: string): Promise<StaffRow[]> {
  const ctx = await platformSchoolContext(slug);
  return listStaff(ctx);
}

/**
 * Les membres actifs qui n'ont plus aucune fonction (par exemple un ancien
 * responsable à qui on a retiré le rôle de fondateur) : absents de listStaff,
 * il faut pouvoir les redésigner responsable.
 */
export async function listMembersWithoutFunction(schoolId: string): Promise<{ userId: string; name: string; email: string | null; phone: string | null }[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('school_memberships')
    .select('user_id, users(first_name, last_name, display_name, auth_email, phone_e164), membership_roles!left(role_id)')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
    .is('membership_roles', null)
    .limit(200);
  if (error) throw error;
  type Row = {
    user_id: string;
    users: { first_name: string | null; last_name: string | null; display_name: string | null; auth_email: string | null; phone_e164: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((m) => ({
    userId: m.user_id,
    name: `${(m.users?.last_name ?? '').toUpperCase()} ${m.users?.first_name ?? ''}`.trim() || m.users?.display_name || m.users?.auth_email || '—',
    email: m.users?.auth_email ?? null,
    phone: m.users?.phone_e164 ?? null,
  }));
}
