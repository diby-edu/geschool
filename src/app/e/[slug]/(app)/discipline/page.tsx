import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listIncidents, incidentTally, listSanctionTypes } from '@/features/discipline/queries';
import { SanctionForm } from '@/features/discipline/components/IncidentForms';
import {
  decideSanctionAction,
  deleteIncidentAction,
  setIncidentStatusAction,
  setSanctionStatusAction,
} from '@/features/discipline/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Discipline' };

const frDate = (iso: string) => iso.split('-').reverse().join('/');

const SANCTION_STATUS: Record<string, string> = {
  PLANNED: 'prévue',
  DONE: 'effectuée',
  CANCELLED: 'annulée',
};

/**
 * Discipline : ce qui s'est passé, et ce qui a été décidé.
 *
 * Un enseignant voit les incidents de ses élèves (la base s'en charge) ; la vie
 * scolaire voit tout l'établissement et prononce les sanctions.
 */
export default async function DisciplinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['discipline.view', 'discipline.create']);
  requireFeature(ctx, 'discipline');

  const onglet = typeof sp.onglet === 'string' ? sp.onglet : 'incidents';
  const [incidents, tally, sanctionTypes] = await Promise.all([
    listIncidents(ctx, typeof sp.eleve === 'string' ? { studentId: sp.eleve } : {}),
    incidentTally(ctx),
    listSanctionTypes(ctx),
  ]);
  const canDecide = hasPermission(ctx, 'discipline.decide');
  const canDelete = hasPermission(ctx, 'discipline.delete');
  const base = `/e/${slug}/discipline`;
  const activeTypes = sanctionTypes.filter((t) => t.isActive);

  const TABS = [
    { key: 'incidents', label: 'Incidents' },
    { key: 'suivi', label: 'Suivi par élève' },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Discipline"
        description="Incidents signalés et sanctions prononcées."
        action={
          <div className="flex gap-2">
            {hasPermission(ctx, 'discipline.configure') ? (
              <Link href={`${base}/config`}>
                <Button variant="secondary">Motifs et sanctions</Button>
              </Link>
            ) : null}
            <Link href={`${base}/new`}>
              <Button>Signaler un incident</Button>
            </Link>
          </div>
        }
      />

      {typeof sp.signale === 'string' ? <Alert tone="success">Incident signalé.</Alert> : null}
      {typeof sp.sanctionne === 'string' ? <Alert tone="success">Sanction enregistrée.</Alert> : null}
      {typeof sp.maj === 'string' ? <Alert tone="success">Mise à jour enregistrée.</Alert> : null}
      {typeof sp.supprime === 'string' ? <Alert tone="success">Incident supprimé.</Alert> : null}

      <nav aria-label="Sections de la discipline" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.key === onglet;
          return (
            <Link
              key={t.key}
              href={`${base}?onglet=${t.key}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {onglet === 'suivi' ? (
        tally.length === 0 ? (
          <EmptyState title="Aucun incident cette année" hint="Rien à suivre pour l’instant." />
        ) : (
          <ul className="space-y-2">
            {tally.map((t) => (
              <li key={t.studentId}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium">{t.studentName}</span>
                      <br />
                      <span className="text-xs text-[color:var(--muted-foreground)]">{t.className}</span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="font-semibold tabular-nums">{t.count}</span> incident{t.count > 1 ? 's' : ''}
                      {t.points > 0 ? (
                        <>
                          <br />
                          <span className="text-xs text-[color:var(--muted-foreground)]">
                            {t.points} point{t.points > 1 ? 's' : ''}
                          </span>
                        </>
                      ) : null}
                      <br />
                      <Link href={`${base}?eleve=${t.studentId}`} className="text-xs hover:underline">
                        Voir ses incidents
                      </Link>
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : incidents.length === 0 ? (
        <EmptyState
          title="Aucun incident"
          hint="Tant mieux. Utilisez « Signaler un incident » quand c’est nécessaire."
          action={{ href: `${base}/new`, label: 'Signaler un incident' }}
        />
      ) : (
        <ul className="space-y-2">
          {incidents.map((i) => (
            <li key={i.id}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {i.studentName} · <span className="font-normal">{i.typeName}</span>
                        {i.status === 'CLOSED' ? (
                          <span className="ml-2 rounded-full bg-[color:var(--muted)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--muted-foreground)]">
                            classé
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {frDate(i.occurredOn)}
                        {i.occurredAt ? ` à ${i.occurredAt}` : ''} · {i.className} · {i.matricule}
                      </p>
                      {i.description ? <p className="mt-1 text-sm">{i.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canDecide ? (
                        <ConfirmSubmit
                          action={setIncidentStatusAction.bind(null, slug, i.id, i.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
                          label={i.status === 'CLOSED' ? 'Rouvrir' : 'Classer'}
                          variant="secondary"
                          confirmMessage={
                            i.status === 'CLOSED' ? 'Rouvrir cet incident ?' : 'Classer cet incident, sans autre suite ?'
                          }
                        />
                      ) : null}
                      {canDelete ? (
                        <ConfirmSubmit
                          action={deleteIncidentAction.bind(null, slug, i.id)}
                          label="Supprimer"
                          confirmMessage={`Supprimer cet incident de ${i.studentName} ? Ses sanctions seront supprimées aussi.`}
                        />
                      ) : null}
                    </div>
                  </div>

                  {i.sanctions.length > 0 ? (
                    <ul className="space-y-1 border-t pt-2">
                      {i.sanctions.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {s.name}
                            {s.startsOn ? ` · du ${frDate(s.startsOn)}` : ''}
                            {s.endsOn ? ` au ${frDate(s.endsOn)}` : ''}{' '}
                            <span className="text-xs text-[color:var(--muted-foreground)]">
                              ({SANCTION_STATUS[s.status] ?? s.status})
                            </span>
                          </span>
                          {canDecide && s.status === 'PLANNED' ? (
                            <span className="flex gap-2">
                              <ConfirmSubmit
                                action={setSanctionStatusAction.bind(null, slug, s.id, 'DONE')}
                                label="Effectuée"
                                variant="secondary"
                                confirmMessage="Marquer cette sanction comme effectuée ?"
                              />
                              <ConfirmSubmit
                                action={setSanctionStatusAction.bind(null, slug, s.id, 'CANCELLED')}
                                label="Annuler"
                                variant="secondary"
                                confirmMessage="Annuler cette sanction ?"
                              />
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {canDecide && i.status === 'OPEN' && activeTypes.length > 0 ? (
                    <details className="border-t pt-2">
                      <summary className="cursor-pointer text-sm font-semibold">Prononcer une sanction</summary>
                      <div className="mt-2">
                        <SanctionForm
                          action={decideSanctionAction.bind(null, slug, i.id)}
                          studentId={i.studentId}
                          studentName={i.studentName}
                          types={activeTypes.map((t) => ({ id: t.id, name: t.name, needsDates: t.needsDates }))}
                        />
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
