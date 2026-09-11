import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listCycles, listLevels } from '@/features/structure/queries';
import { createCycleAction, deleteCycleAction, createLevelAction, deleteLevelAction } from '@/features/structure/actions';
import { CycleCreateForm, LevelCreateForm } from '@/features/structure/components/StructureForms';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Structure pedagogique' };

export default async function StructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['cycles.view', 'levels.view']);

  const [cycles, levels] = await Promise.all([listCycles(ctx), listLevels(ctx)]);
  const canCycles = hasPermission(ctx, 'cycles.manage');
  const canLevels = hasPermission(ctx, 'levels.manage');

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      <PageHeader
        title="Structure pedagogique"
        description="Cycles et niveaux. Les classes sont creees a partir des niveaux."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Cycles</h2>
        {cycles.length === 0 ? (
          <EmptyState title="Aucun cycle" />
        ) : (
          <ul className="space-y-2">
            {cycles.map((c) => (
              <li key={c.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <span>
                      <span className="font-medium">{c.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{c.code}</span>
                    </span>
                    {canCycles ? (
                      <ConfirmSubmit
                        action={deleteCycleAction.bind(null, slug, c.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le cycle « ${c.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canCycles ? <CycleCreateForm action={createCycleAction.bind(null, slug)} /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Niveaux</h2>
        {levels.length === 0 ? (
          <EmptyState title="Aucun niveau" hint="Creez d'abord un cycle, puis ajoutez-y des niveaux." />
        ) : (
          <ul className="space-y-2">
            {levels.map((l) => (
              <li key={l.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <span>
                      <span className="font-medium">{l.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{l.code}</span>
                      {l.cycle_name ? (
                        <span className="text-xs text-[color:var(--muted-foreground)]"> · {l.cycle_name}</span>
                      ) : null}
                    </span>
                    {canLevels ? (
                      <ConfirmSubmit
                        action={deleteLevelAction.bind(null, slug, l.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le niveau « ${l.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canLevels && cycles.length > 0 ? (
          <LevelCreateForm action={createLevelAction.bind(null, slug)} cycles={cycles} />
        ) : null}
      </section>
    </div>
  );
}
