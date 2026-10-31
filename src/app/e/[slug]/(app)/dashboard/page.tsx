import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { getDashboardData } from '@/features/dashboard/queries';
import { getActiveSpace } from '@/features/navigation/spaces';
import { StaffView } from '@/features/dashboard/components/StaffView';
import { RoleView } from '@/features/dashboard/components/RoleView';
import { TeacherView } from '@/features/dashboard/components/TeacherView';
import { FamilyView } from '@/features/dashboard/components/FamilyView';
import { myChildren, parentPortal, pickChild } from '@/features/family/children';
import { ParentChrome } from '@/features/family/components/ParentChrome';
import { usesFullDashboard } from '@/features/dashboard/profiles';
import { getFunctionPermissionCodes } from '@/features/roles/queries';
import { hasPermission } from '@/lib/permissions';
import { isStaffFunction, roleLabel, type RoleCode } from '@/lib/permissions/roles';
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
    if (apercu && isStaffFunction(apercu) && hasPermission(ctx, 'users.assign_roles')) {
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
          preview={{ label: roleLabel(apercu), backHref: `/e/${slug}/roles?role=${apercu}` }}
        />
      );
    }
    const roles = ctx.membership?.roles ?? [];
    return usesFullDashboard(roles) ? <StaffView ctx={ctx} sp={sp} /> : <RoleView ctx={ctx} sp={sp} roles={roles} />;
  }

  const data = await getDashboardData(ctx, space);
  if (data.kind === 'teacher') return <TeacherView ctx={ctx} data={data} sp={sp} />;

  // Espace Parent (0172) : un onglet par enfant en haut ; un enfant non payé
  // n'ouvre que l'écran de paiement. Sans enfant, le tableau d'avant.
  const [kids, portal] = await Promise.all([myChildren(ctx), parentPortal(ctx)]);
  if (kids.length === 0) return <FamilyView ctx={ctx} data={data} sp={sp} />;
  const child = pickChild(kids, typeof sp.enfant === 'string' ? sp.enfant : undefined);
  return (
    <ParentChrome slug={slug} kids={kids} current={child} path="dashboard" price={portal.price} unread={data.unreadNotifications}>
      <FamilyView ctx={ctx} data={{ ...data, students: data.students.filter((s) => s.id === child?.id) }} sp={sp} />
    </ParentChrome>
  );
}
