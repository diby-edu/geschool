import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { roleLabel, STAFF_FUNCTIONS, type RoleCode } from '@/lib/permissions/roles';
import type { TenantContext } from '@/lib/tenant/context';

export type StaffState = 'ACTIVE' | 'TO_ACTIVATE' | 'SUSPENDED';

export type StaffRow = {
  /** Clé de ligne = identifiant de la personne. */
  id: string;
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  functions: { code: string; label: string }[];
  /** Fondateur : complet, ni suspendable ni modifiable par un tiers. */
  isFounder: boolean;
  /** Téléphone de connexion (E.164) ou e-mail. */
  identifier: string | null;
  /** Identifiant tel qu'on le lit (numéro mis en forme). */
  identifierDisplay: string | null;
  loginKind: string | null;
  phone2: string | null;
  email: string | null;
  staffNumber: string | null;
  employmentType: string | null;
  hireDate: string | null;
  diploma: string | null;
  diplomaDetail: string | null;
  state: StaffState;
  /** Nature de l'accès : un enseignant promu au personnel garde `TEACHER`. */
  accessKind: string | null;
  hasProfile: boolean;
};

const STAFF_CODES: readonly string[] = ['SCHOOL_ADMIN', ...STAFF_FUNCTIONS];
const CHUNK = 80;

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Profile = {
  user_id: string;
  staff_number: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  phone2_e164: string | null;
  email: string | null;
  diploma: string | null;
  diploma_detail: string | null;
  hire_date: string | null;
  employment_type: string | null;
};

type Membership = {
  id: string;
  user_id: string;
  users: { first_name: string; last_name: string; display_name: string | null; contact_email: string | null } | null;
};

type Access = {
  user_id: string;
  subject_kind: string;
  login_kind: string;
  login_identifier: string;
  account_status: string;
  activation_status: string;
};

/**
 * Personnel administratif de l'établissement : toute personne qui exerce le rôle
 * de Fondateur ou l'une des fonctions du personnel. Les enseignants et les
 * parents n'en font pas partie (sauf s'ils cumulent une fonction du personnel).
 *
 * Deux temps pour ne pas lire les membres d'une école entière (des milliers de
 * parents) : on part des FONCTIONS, on remonte aux personnes, puis on charge leurs
 * données par lots.
 */
export async function listStaff(ctx: TenantContext): Promise<StaffRow[]> {
  const supabase = await createClient();

  // 1. Fonctions concernées : la copie de l'établissement, sinon le modèle.
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, code')
    .in('code', [...STAFF_CODES])
    .or(`school_id.eq.${ctx.school.id},school_id.is.null`);
  if (rolesError) throw rolesError;
  const codeByRole = new Map((roles ?? []).map((r) => [r.id, r.code]));
  if (codeByRole.size === 0) return [];

  // 2. Personnes qui les exercent (uniquement dans CET établissement).
  const { data: links, error: linksError } = await supabase
    .from('membership_roles')
    .select('membership_id, role_id, school_memberships!inner(school_id)')
    .in('role_id', [...codeByRole.keys()])
    .eq('school_memberships.school_id', ctx.school.id);
  if (linksError) throw linksError;
  const codesByMembership = new Map<string, string[]>();
  for (const l of (links ?? []) as unknown as { membership_id: string; role_id: string }[]) {
    const code = codeByRole.get(l.role_id);
    if (code) codesByMembership.set(l.membership_id, [...(codesByMembership.get(l.membership_id) ?? []), code]);
  }
  const membershipIds = [...codesByMembership.keys()];
  if (membershipIds.length === 0) return [];

  // 3. Données des personnes, par lots.
  const memberships: Membership[] = [];
  for (const ids of chunk(membershipIds)) {
    const { data, error } = await supabase
      .from('school_memberships')
      .select('id, user_id, users(first_name, last_name, display_name, contact_email)')
      .eq('school_id', ctx.school.id)
      .in('id', ids);
    if (error) throw error;
    memberships.push(...((data ?? []) as unknown as Membership[]));
  }
  const userIds = memberships.map((m) => m.user_id);

  const accesses = new Map<string, Access>();
  const profiles = new Map<string, Profile>();
  await Promise.all(
    chunk(userIds).map(async (ids) => {
      const [{ data: a, error: ae }, { data: p, error: pe }] = await Promise.all([
        supabase
          .from('account_access')
          .select('user_id, subject_kind, login_kind, login_identifier, account_status, activation_status')
          .eq('school_id', ctx.school.id)
          .in('user_id', ids),
        supabase
          .from('staff_profiles' as never)
          .select(
            'user_id, staff_number, first_name, last_name, gender, birth_date, birth_place, phone2_e164, email, diploma, diploma_detail, hire_date, employment_type',
          )
          .eq('school_id', ctx.school.id)
          .in('user_id', ids),
      ]);
      if (ae) throw ae;
      if (pe) throw pe;
      for (const row of (a ?? []) as unknown as Access[]) accesses.set(row.user_id, row);
      for (const row of (p ?? []) as unknown as Profile[]) profiles.set(row.user_id, row);
    }),
  );

  return memberships
    .map((m) => {
      const codes = codesByMembership.get(m.id) ?? [];
      const access = accesses.get(m.user_id) ?? null;
      const profile = profiles.get(m.user_id) ?? null;
      const firstName = profile?.first_name ?? m.users?.first_name ?? '';
      const lastName = profile?.last_name ?? m.users?.last_name ?? '';
      const identifier = access?.login_identifier ?? null;
      const state: StaffState =
        access?.account_status === 'SUSPENDED'
          ? 'SUSPENDED'
          : access?.activation_status === 'ACTIVATED'
            ? 'ACTIVE'
            : 'TO_ACTIVATE';
      const isFounder = codes.includes('SCHOOL_ADMIN');
      return {
        id: m.user_id,
        userId: m.user_id,
        name: `${lastName.toUpperCase()} ${firstName}`.trim() || m.users?.display_name || '—',
        firstName,
        lastName,
        gender: profile?.gender ?? null,
        birthDate: profile?.birth_date ?? null,
        birthPlace: profile?.birth_place ?? null,
        functions: codes
          .filter((c) => STAFF_CODES.includes(c))
          .sort((a, b) => STAFF_CODES.indexOf(a) - STAFF_CODES.indexOf(b))
          .map((c) => ({ code: c, label: roleLabel(c as RoleCode) })),
        isFounder,
        identifier,
        identifierDisplay:
          identifier && identifier.startsWith('+') ? formatPhoneForDisplay(identifier, ctx.school.countryCode) : identifier,
        loginKind: access?.login_kind ?? null,
        phone2: profile?.phone2_e164 ?? null,
        email: profile?.email ?? m.users?.contact_email ?? (access?.login_kind === 'EMAIL' ? identifier : null),
        staffNumber: profile?.staff_number ?? null,
        employmentType: profile?.employment_type ?? null,
        hireDate: profile?.hire_date ?? null,
        diploma: profile?.diploma ?? null,
        diplomaDetail: profile?.diploma_detail ?? null,
        state,
        accessKind: access?.subject_kind ?? null,
        hasProfile: profile !== null,
      } satisfies StaffRow;
    })
    .sort((a, b) => Number(b.isFounder) - Number(a.isFounder) || a.name.localeCompare(b.name, 'fr'));
}

/** Une personne du personnel, ou null si elle n'en fait pas partie. */
export async function getStaffMember(ctx: TenantContext, userId: string): Promise<StaffRow | null> {
  return (await listStaff(ctx)).find((s) => s.userId === userId) ?? null;
}
