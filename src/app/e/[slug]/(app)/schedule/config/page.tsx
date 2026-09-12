import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getConfig } from '@/features/schedule/config';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { ConfigForm } from '@/features/schedule/components/ConfigForm';
import { saveConfigAction } from '@/features/schedule/actions';

export const metadata: Metadata = { title: 'Grille horaire' };

export default async function ScheduleConfigPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.manage_configuration');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Grille horaire" />
        <EmptyState title="Aucune annee active" hint="Activez une annee scolaire d'abord." />
      </div>
    );
  }

  const config = await getConfig(ctx, ctx.academicYear.id);
  const defaults = config
    ? {
        workingDays: config.working_days as number[],
        dayStart: (config.day_starts_at as string).slice(0, 5),
        dayEnd: (config.day_ends_at as string).slice(0, 5),
        slotMinutes: config.default_session_minutes as number,
      }
    : { workingDays: [1, 2, 3, 4, 5], dayStart: '07:30', dayEnd: '18:00', slotMinutes: 55 };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Grille horaire"
        description="Jours travailles et decoupage des creneaux."
        action={
          <Link href={`/e/${slug}/schedule`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <ConfigForm action={saveConfigAction.bind(null, slug)} defaults={defaults} />
    </div>
  );
}
