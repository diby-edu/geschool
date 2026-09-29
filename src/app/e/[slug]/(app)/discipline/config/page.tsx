import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listIncidentTypes, listSanctionTypes } from '@/features/discipline/queries';
import { INCIDENT_SUGGESTIONS, SANCTION_SUGGESTIONS } from '@/features/discipline/suggestions';
import {
  createIncidentTypeAction,
  createSanctionTypeAction,
  deleteIncidentTypeAction,
  deleteSanctionTypeAction,
} from '@/features/discipline/actions';
import { NamedListForm } from '@/components/forms/NamedListForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Motifs et sanctions' };

/**
 * Le règlement intérieur de l'établissement, en deux listes : ce qui peut être
 * reproché, et ce qui peut être décidé. Chaque école écrit les siennes — les
 * suggestions ne sont que des mots pour démarrer.
 */
export default async function DisciplineConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'discipline.configure');
  requireFeature(ctx, 'discipline');

  const [incidentTypes, sanctionTypes] = await Promise.all([listIncidentTypes(ctx), listSanctionTypes(ctx)]);
  const canManage = hasPermission(ctx, 'discipline.configure');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Motifs et sanctions"
        description="Votre règlement intérieur, tel que l’application doit le connaître."
        action={
          <Link href={`/e/${slug}/discipline`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Motifs d’incident
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Les points servent aux écoles qui tiennent un barème de comportement. Laissez zéro si vous n’en utilisez pas :
          rien ne s’affichera.
        </p>
        {incidentTypes.length === 0 ? (
          <EmptyState title="Aucun motif" hint="Ajoutez-en un, ou partez d’une suggestion." />
        ) : (
          <ul className="space-y-2">
            {incidentTypes.map((t) => (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{t.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{t.code}</span>
                      {t.points > 0 ? (
                        <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                          {t.points} point{t.points > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                    {canManage ? (
                      <ConfirmSubmit
                        action={deleteIncidentTypeAction.bind(null, slug, t.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le motif « ${t.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <NamedListForm
            action={createIncidentTypeAction.bind(null, slug)}
            title="Ajouter un motif"
            placeholder="Téléphone en classe"
            suggestions={INCIDENT_SUGGESTIONS}
            existing={incidentTypes.map((t) => t.name)}
            extraField={{ name: 'points', label: 'Points', type: 'number', defaultValue: '0', hint: '0 = pas de barème' }}
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Sanctions</h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Cochez « sur plusieurs jours » pour une exclusion ou une retenue : le formulaire demandera alors des dates.
        </p>
        {sanctionTypes.length === 0 ? (
          <EmptyState title="Aucune sanction" hint="Ajoutez-en une, ou partez d’une suggestion." />
        ) : (
          <ul className="space-y-2">
            {sanctionTypes.map((t) => (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{t.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{t.code}</span>
                      {t.needsDates ? (
                        <span className="ml-2 text-xs text-[color:var(--muted-foreground)]">· sur plusieurs jours</span>
                      ) : null}
                    </div>
                    {canManage ? (
                      <ConfirmSubmit
                        action={deleteSanctionTypeAction.bind(null, slug, t.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer la sanction « ${t.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <NamedListForm
            action={createSanctionTypeAction.bind(null, slug)}
            title="Ajouter une sanction"
            placeholder="Exclusion temporaire"
            suggestions={SANCTION_SUGGESTIONS}
            existing={sanctionTypes.map((t) => t.name)}
            checkbox={{ name: 'needsDates', label: 'Sur plusieurs jours (dates demandées)' }}
          />
        ) : null}
      </section>
    </div>
  );
}
