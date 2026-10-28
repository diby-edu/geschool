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
import { AttendanceSyncButton } from '@/features/attendance/components/AttendanceSyncButton';
import { hasPermission } from '@/lib/permissions';
import { myHeadClasses } from '@/features/reporting/matrix';
import { BillingBlockedPage, BillingGraceBanner } from '@/features/billing/components/BillingGate';
import { readPaymentSettings } from '@/features/billing/payment-settings';
import { getRequestThread, listSchoolRequests } from '@/features/support/requests';
import { platformBanners } from '@/features/communication/inbox';
import { readPlatformContact } from '@/features/platform/settings';
import { PlatformBanner } from '@/features/communication/components/PlatformBanner';

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

  // Abonnement expiré et délai de grâce passé (0143) : l'accès est coupé pour
  // TOUT le monde jusqu'au paiement ; la direction voit comment payer. Le Super
  // Admin, lui, entre toujours (support, confirmation du paiement).
  const roleCodes = ctx.membership?.roles ?? [];
  const isDirection = hasPermission(ctx, 'billing.view') || roleCodes.includes('SCHOOL_ADMIN') || roleCodes.includes('DIRECTOR');
  if (ctx.billing?.blocked && !ctx.isPlatformAdmin) {
    return (
      <BillingBlockedPage
        schoolName={ctx.school.name}
        endsOn={ctx.billing.endsOn}
        isDirection={isDirection}
        payment={isDirection ? await readPaymentSettings().catch(() => null) : null}
        contact={hasPermission(ctx, 'support.contact') ? { slug, threads: await blockedThreads(ctx) } : null}
        support={isDirection ? await readPlatformContact().catch(() => null) : null}
      />
    );
  }
  // Messages « importants » de la plateforme, jusqu'à « J'ai compris » (lot 5).
  const banners = await platformBanners(ctx).catch(() => []);
  // Remise d'une sauvegarde en cours (0156) : tout le monde doit le savoir, et ne rien saisir.
  const restoring = await import('@/services/school-backup').then((m) => m.restoreRunning(ctx.school.id)).catch(() => false);
  const inGrace = ctx.billing?.situation === 'EXPIRED' && !ctx.billing.blocked && isDirection && !ctx.isPlatformAdmin;

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
  const [topBar, headClasses] = await Promise.all([
    loadTopBar(ctx, roleLabel_),
    roles.includes('TEACHER') ? myHeadClasses(ctx) : Promise.resolve([]),
  ]);

  return (
    <AppShell
      topBar={topBar}
      brand={ctx.school.shortName ?? ctx.school.name}
      subtitle={ctx.academicYear?.name ?? 'Aucune année active'}
      nav={buildSchoolNav(ctx, space, { headTeacher: headClasses.length > 0 })}
      headerExtra={
        <>
          <LiveRefresh schoolId={ctx.school.id} tables={LIVE_TABLES} />
          {/* Appels faits sans réseau : relancés depuis n'importe quelle page,
              et visibles tant qu'ils ne sont pas reçus par le serveur. */}
          <AttendanceSyncButton
            userId={ctx.user.id}
            alwaysVisible={!ctx.isPlatformAdmin && (roles.includes('TEACHER') || hasPermission(ctx, 'attendance.create'))}
          />
          <SpaceSwitcher slug={slug} current={space} spaces={spaces} />
        </>
      }
      // Un Super Admin arrive ici depuis /admin : sans ce lien, il resterait
      // captif de l'espace etablissement (aucune entree du menu ne pointe vers
      // la plateforme).
      {...(ctx.isPlatformAdmin ? { back: { href: '/admin', label: 'Retour à la plateforme' } } : {})}
      user={{ displayName: ctx.user.displayName, roleLabel: roleLabel_ }}
    >
      {/* Administrateur de la plateforme chez un client : il a tous les droits
          sans etre membre, et rien a l'ecran ne le lui rappelait. */}
      {support ? <SupportBanner schoolName={ctx.school.name} /> : null}
      {inGrace ? <BillingGraceBanner slug={slug} endsOn={ctx.billing?.endsOn ?? null} graceEndsOn={ctx.billing?.graceEndsOn ?? null} /> : null}
      {banners.map((b) => (
        <PlatformBanner key={b.id} slug={slug} banner={b} />
      ))}
      {restoring ? (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)' }}>
          Remise d’une sauvegarde en cours — merci de ne rien saisir pendant quelques minutes. Ce que vous enregistreriez maintenant pourrait être remplacé.
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}

/** Pendant la coupure : les 3 dernières demandes à la plateforme, avec leur fil. */
async function blockedThreads(ctx: Parameters<typeof listSchoolRequests>[0]) {
  const recent = (await listSchoolRequests(ctx).catch(() => [])).slice(0, 3);
  const threads = await Promise.all(recent.map((r) => getRequestThread(r.id, ctx.school.id).catch(() => null)));
  return threads.filter((t): t is NonNullable<typeof t> => t !== null);
}
