import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getConfig } from '@/features/schedule/config';
import { listVersions } from '@/features/schedule/versions';
import { createVersionAction, deleteVersionAction } from '@/features/schedule/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Emploi du temps' };

const STATUS: Record<string, string> = { DRAFT: 'Brouillon', VALIDATED: 'Valide', PUBLISHED: 'Publie', ARCHIVED: 'Archive' };

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.view');
  const base = `/e/${slug}/schedule`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Emploi du temps" />
        <EmptyState title="Aucune annee active" hint="Activez une annee scolaire d'abord." />
      </div>
    );
  }

  const config = await getConfig(ctx, ctx.academicYear.id);
  const versions = config ? await listVersions(ctx, ctx.academicYear.id) : [];
  const canConfig = hasPermission(ctx, 'schedule.manage_configuration');
  const canCreate = hasPermission(ctx, 'schedule.create');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash searchParams={sp} />
      {sp.configured === '1' ? <Alert tone="success">Grille horaire enregistree.</Alert> : null}
      <PageHeader
        title="Emploi du temps"
        description={`Annee ${ctx.academicYear.name}`}
        action={
          canConfig ? (
            <Link href={`${base}/config`}>
              <Button variant="secondary">{config ? 'Modifier la grille' : 'Configurer la grille'}</Button>
            </Link>
          ) : null
        }
      />

      {!config ? (
        <EmptyState
          title="Grille horaire non configuree"
          hint="Definissez d'abord les jours travailles et les creneaux."
        />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Versions
            </h2>
            {canCreate ? <SimpleSubmit action={createVersionAction.bind(null, slug)} label="Nouvelle version" small /> : null}
          </div>

          {versions.length === 0 ? (
            <EmptyState title="Aucune version" hint="Creez une version pour saisir l'emploi du temps." />
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <Link href={`${base}/${v.id}`} className="font-medium hover:underline">
                          {v.name}
                        </Link>
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                          {STATUS[v.status] ?? v.status} · {v.source === 'MANUAL' ? 'Saisie manuelle' : 'Genere'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`${base}/${v.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">
                          Ouvrir
                        </Link>
                        {canCreate && v.status === 'DRAFT' ? (
                          <ConfirmSubmit
                            action={deleteVersionAction.bind(null, slug, v.id)}
                            label="Supprimer"
                            variant="secondary"
                            confirmMessage={`Supprimer « ${v.name} » ?`}
                          />
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
