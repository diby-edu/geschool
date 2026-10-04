import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { getTenantContext } from '@/lib/tenant/context';
import { traceSupportEntry } from '@/lib/tenant/support-trace';
import { AppShell } from '@/components/layout/AppShell';
import { buildSchoolNav } from '@/features/navigation/school-nav';
import { availableSpaces, getActiveSpace, SPACE_LABELS } from '@/features/navigation/spaces';
import { SpaceSwitcher } from '@/features/navigation/components/SpaceSwitcher';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { loadTopBar } from '@/features/navigation/top-bar';
import { LIVE_TABLES } from '@/components/realtime/live-tables';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { SupportBanner } from '@/components/layout/SupportBanner';

/**
 * Garde de l'espace etablissement. getTenantContext resout le tenant depuis le
 * slug et verifie l'appartenance : un non-membre obtient un 404, jamais un 403
 * (ARCHITECTURE.md §4). Le middleware a deja verifie la signature du jeton ;
 * getTenantContext verifie en plus que la session est toujours ouverte (acces
 * suspendu -> retour a la connexion) et relit a la source le drapeau de premiere
 * connexion, que le jeton peut ignorer s'il a ete pose apres son emission.
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
    if (isAppError(error) && error.code === 'UNAUTHENTICATED') {
      redirect(`/login?next=${encodeURIComponent(`/e/${slug}`)}`);
    }
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  if (ctx.user.mustChangePassword) redirect('/first-login');

  // Un administrateur de la plateforme chez un client : la trace se pose ICI,
  // a l'arrivee, et non sur le bouton qui l'a amene — un lien direct, une
  // adresse tapee ou un favori entrent par la meme porte (support-trace.ts).
  const support = ctx.isPlatformAdmin && !ctx.membership;
  if (support) await traceSupportEntry(ctx.user.id, ctx.school.id);

  const spaces = availableSpaces(ctx);
  const space = await getActiveSpace(ctx);
  const roles = ctx.membership?.roles ?? [];
  const primaryRole = (roles[0] ?? (ctx.isPlatformAdmin ? undefined : undefined)) as
    | RoleCode
    | undefined;

  const roleLabel_ = ctx.isPlatformAdmin
    ? 'Super Admin'
    : spaces.length > 1
      ? `Espace ${SPACE_LABELS[space]}`
      : primaryRole
        ? roleLabel(primaryRole)
        : 'Membre';
  const topBar = await loadTopBar(ctx, roleLabel_);

  return (
    <AppShell
      topBar={topBar}
      brand={ctx.school.shortName ?? ctx.school.name}
      subtitle={ctx.academicYear?.name ?? 'Aucune année active'}
      nav={buildSchoolNav(ctx, space)}
      headerExtra={
        <>
          <LiveRefresh schoolId={ctx.school.id} tables={LIVE_TABLES} />
          <SpaceSwitcher slug={slug} current={space} spaces={spaces} />
        </>
      }
      // Un Super Admin arrive ici depuis /admin : sans ce lien, il resterait
      // captif de l'espace etablissement (aucune entree du menu ne pointe vers
      // la plateforme).
      {...(ctx.isPlatformAdmin ? { back: { href: '/admin', label: 'Retour a la plateforme' } } : {})}
      user={{ displayName: ctx.user.displayName, roleLabel: roleLabel_ }}
    >
      {/* Administrateur de la plateforme chez un client : il a tous les droits
          sans etre membre, et rien a l'ecran ne le lui rappelait. */}
      {support ? <SupportBanner schoolName={ctx.school.name} /> : null}
      {children}
    </AppShell>
  );
}
