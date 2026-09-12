import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listScales, listTypes } from '@/features/evaluations/config';
import {
  seedDefaultsAction,
  saveScaleAction,
  deleteScaleAction,
  saveTypeAction,
  deleteTypeAction,
} from '@/features/evaluations/actions';
import { ScaleForm } from '@/features/evaluations/components/ScaleForm';
import { TypeForm } from '@/features/evaluations/components/TypeForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Barèmes et types d’évaluation' };

export default async function EvaluationConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['grading.manage_scales', 'grading.manage_settings']);
  const base = `/e/${slug}/evaluations`;

  const [scales, types] = await Promise.all([listScales(ctx), listTypes(ctx)]);
  const canScales = hasPermission(ctx, 'grading.manage_scales');
  const canTypes = hasPermission(ctx, 'grading.manage_settings');
  const empty = scales.length === 0 && types.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      {sp.seeded !== undefined ? <Alert tone="success">Configuration de départ créée.</Alert> : null}
      {sp.scale === '1' ? <Alert tone="success">Barème enregistré.</Alert> : null}
      {sp.type === '1' ? <Alert tone="success">Type enregistré.</Alert> : null}

      <PageHeader
        title="Barèmes et types d’évaluation"
        description="Aucune règle n’est imposée : tout est configurable."
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      {empty && canScales ? (
        <Card>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Rien n’est encore configuré. Créez un jeu de départ (barème /20 + types courants) que
              vous pourrez ensuite ajuster.
            </p>
            <SimpleSubmit action={seedDefaultsAction.bind(null, slug)} label="Créer les valeurs par défaut" />
          </CardContent>
        </Card>
      ) : null}

      {/* Barèmes */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Barèmes</h2>
        <ul className="space-y-2">
          {scales.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{s.name}</span>{' '}
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {s.code} · {s.min_score}–{s.max_score} · réussite {s.passing_score}
                        {s.is_default ? ' · par défaut' : ''}
                      </span>
                    </div>
                    {canScales ? (
                      <ConfirmSubmit
                        action={deleteScaleAction.bind(null, slug, s.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le barème « ${s.name} » ?`}
                      />
                    ) : null}
                  </div>
                  {canScales ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-[color:var(--color-brand)]">Modifier</summary>
                      <div className="mt-3">
                        <ScaleForm action={saveScaleAction.bind(null, slug, s.id)} defaults={s} submitLabel="Enregistrer" />
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
        {canScales ? (
          <Card>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ajouter un barème</summary>
                <div className="mt-3">
                  <ScaleForm action={saveScaleAction.bind(null, slug, null)} submitLabel="Créer le barème" />
                </div>
              </details>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* Types */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Types d’évaluation</h2>
        <ul className="space-y-2">
          {types.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{t.name}</span>{' '}
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {t.code} · coef. {t.default_coefficient}
                        {t.counts_in_average ? '' : ' · hors moyenne'}
                      </span>
                    </div>
                    {canTypes ? (
                      <ConfirmSubmit
                        action={deleteTypeAction.bind(null, slug, t.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le type « ${t.name} » ?`}
                      />
                    ) : null}
                  </div>
                  {canTypes ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-[color:var(--color-brand)]">Modifier</summary>
                      <div className="mt-3">
                        <TypeForm action={saveTypeAction.bind(null, slug, t.id)} defaults={t} submitLabel="Enregistrer" />
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
        {canTypes ? (
          <Card>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ajouter un type</summary>
                <div className="mt-3">
                  <TypeForm action={saveTypeAction.bind(null, slug, null)} submitLabel="Créer le type" />
                </div>
              </details>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
