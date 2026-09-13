import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { createClient } from '@/lib/supabase/server';
import { getOwnConfigForCycle, getDayHours, getBreaks } from '@/features/schedule/config';
import { saveConfigAction, deleteConfigAction } from '@/features/schedule/actions';
import { ConfigForm } from '@/features/schedule/components/ConfigForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Horaires du cycle' };

export default async function CycleHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string; cycleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id, cycleId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.manage_configuration');

  const supabase = await createClient();
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('id', cycleId)
    .maybeSingle();
  if (!cycle) notFound();

  // Grille propre a ce cycle uniquement (pas la resolution avec repli sur la
  // grille par defaut) : cette page gere l'EXCEPTION, pas la valeur effective.
  const ownConfig = await getOwnConfigForCycle(ctx, id, cycleId);

  const [dayHours, breaks] = ownConfig
    ? await Promise.all([getDayHours(ctx, ownConfig.id), getBreaks(ctx, ownConfig.id)])
    : [[], []];
  const hoursDefaults = ownConfig
    ? { workingDays: ownConfig.working_days as number[], dayHours, slotMinutes: ownConfig.default_session_minutes as number, breaks }
    : { workingDays: [1, 2, 3, 4, 5], dayHours: [], slotMinutes: 55, breaks: [] };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {sp.configured === '1' ? <Alert tone="success">Horaires du cycle enregistrés.</Alert> : null}
      {sp.deleted === '1' ? <Alert tone="success">Grille propre supprimée : ce cycle utilise à nouveau la grille par défaut.</Alert> : null}
      <PageHeader
        title={`Horaires — ${cycle.name}`}
        description="Ces horaires et ces pauses ne s'appliquent qu'aux classes de ce cycle ; ils remplacent la grille par défaut de l'année pour elles."
        action={
          <Link href={`/e/${slug}/academic-years/${id}`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <ConfigForm action={saveConfigAction.bind(null, slug, id, cycleId)} defaults={hoursDefaults} />

      {ownConfig ? (
        <ConfirmSubmit
          action={deleteConfigAction.bind(null, slug, id, cycleId, ownConfig.id)}
          label="Supprimer cette grille propre"
          variant="secondary"
          confirmMessage={`Supprimer la grille propre de « ${cycle.name} » ? Ce cycle utilisera de nouveau la grille par défaut de l'année.`}
        />
      ) : null}
    </div>
  );
}
