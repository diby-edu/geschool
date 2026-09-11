import { notFound } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { getTenantContext } from '@/lib/tenant/context';
import { AppShell } from '@/components/layout/AppShell';
import { buildSchoolNav } from '@/features/navigation/school-nav';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';

/**
 * Garde de l'espace etablissement. getTenantContext resout le tenant depuis le
 * slug et verifie l'appartenance : un non-membre obtient un 404, jamais un 403
 * (ARCHITECTURE.md §4). Le middleware a deja garanti qu'une session existe et
 * que la premiere connexion est faite.
 */
export default async function SchoolAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let ctx;
  try {
    ctx = await getTenantContext(slug);
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'UNAUTHENTICATED')) {
      notFound();
    }
    throw error;
  }

  const roles = ctx.membership?.roles ?? [];
  const primaryRole = (roles[0] ?? (ctx.isPlatformAdmin ? undefined : undefined)) as
    | RoleCode
    | undefined;

  return (
    <AppShell
      brand={ctx.school.shortName ?? ctx.school.name}
      subtitle={ctx.academicYear?.name ?? 'Aucune annee active'}
      nav={buildSchoolNav(ctx)}
      user={{
        displayName: ctx.user.displayName,
        roleLabel: ctx.isPlatformAdmin
          ? 'Super Admin'
          : primaryRole
            ? roleLabel(primaryRole)
            : 'Membre',
      }}
    >
      {children}
    </AppShell>
  );
}
