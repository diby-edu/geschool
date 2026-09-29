import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { getDashboardData } from '@/features/dashboard/queries';
import { getActiveSpace } from '@/features/navigation/spaces';
import { StaffView } from '@/features/dashboard/components/StaffView';
import { RoleView } from '@/features/dashboard/components/RoleView';
import { TeacherView } from '@/features/dashboard/components/TeacherView';
import { FamilyView } from '@/features/dashboard/components/FamilyView';
import { usesFullDashboard } from '@/features/dashboard/profiles';
import { getFunctionPermissionCodes } from '@/features/roles/queries';
import { hasPermission } from '@/lib/permissions';
import { roleLabel, STAFF_FUNCTIONS, type RoleCode, type StaffFunction } from '@/lib/permissions/roles';
import type { TenantContext } from '@/lib/tenant/context';

export const metadata: Metadata = { title: 'Tableau de bord' };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  const space = await getActiveSpace(ctx);

  // Espace Direction : le fondateur garde le tableau complet (« Mosaïque ») ; chaque
  // autre fonction a le sien, limité à ses indicateurs et à ses droits (profiles.ts).
  if (space === 'school') {
    // Aperçu (« Rôles et droits ») : le tableau d'une fonction, calculé avec les
    // SEULS droits cochés pour elle. Réservé à qui règle les droits ; il ne montre
    // jamais plus que ce que cette personne voit déjà.
    const apercu = typeof sp.apercu === 'string' ? sp.apercu : null;
    if (apercu && (STAFF_FUNCTIONS as readonly string[]).includes(apercu) && hasPermission(ctx, 'users.assign_roles')) {
      const codes = await getFunctionPermissionCodes(ctx, apercu);
      const previewCtx: TenantContext = {
        ...ctx,
        isPlatformAdmin: false,
        permissions: new Set(codes),
        membership: { id: ctx.membership?.id ?? '', roles: [apercu as RoleCode] },
      };
      return (
        <RoleView
          ctx={previewCtx}
          sp={sp}
          roles={[apercu]}
          preview={{ label: roleLabel(apercu as StaffFunction), backHref: `/e/${slug}/roles?role=${apercu}` }}
        />
      );
    }
    const roles = ctx.membership?.roles ?? [];
    return usesFullDashboard(roles) ? <StaffView ctx={ctx} sp={sp} /> : <RoleView ctx={ctx} sp={sp} roles={roles} />;
  }

  const data = await getDashboardData(ctx, space);
  return data.kind === 'teacher' ? <TeacherView ctx={ctx} data={data} sp={sp} /> : <FamilyView ctx={ctx} data={data} sp={sp} />;
}
