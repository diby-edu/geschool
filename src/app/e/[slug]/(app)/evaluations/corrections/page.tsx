import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listCorrections, listMyPendingCorrections, canOverride } from '@/features/evaluations/corrections';
import {
  acceptCorrectionAction,
  refuseCorrectionAction,
  overrideCorrectionAction,
} from '@/features/evaluations/correction-actions';
import { CorrectionCard } from '@/features/evaluations/components/CorrectionCard';
import { CORRECTION_LABELS } from '@/features/evaluations/correction-types';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Corrections de notes' };

export default async function CorrectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  // Un enseignant doit pouvoir répondre aux demandes qui le concernent, même
  // sans aucun droit d'administration.
  requirePageAccessAny(ctx, ['grades.view', 'grades.view_all', 'grades.request_change']);
  requireFeature(ctx, 'grades');

  const [aTraiter, toutes] = await Promise.all([
    listMyPendingCorrections(ctx),
    hasPermission(ctx, 'grades.view_all') ? listCorrections(ctx) : listCorrections(ctx, { status: 'ALL' }),
  ]);
  const force = canOverride(ctx);
  const aTraiterIds = new Set(aTraiter.map((c) => c.id));
  const enCours = toutes.filter((c) => c.status === 'PENDING' && !aTraiterIds.has(c.id));
  const journal = toutes.filter((c) => c.status !== 'PENDING');

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      {sp.demande ? <Alert tone="success">Demande envoyée à l’enseignant. La note ne change pas tant qu’il n’a pas répondu.</Alert> : null}
      {sp.decide === 'accepted' ? <Alert tone="success">Correction acceptée : la note est modifiée.</Alert> : null}
      {sp.decide === 'refused' ? <Alert tone="success">Refus enregistré. La note reste inchangée.</Alert> : null}
      {sp.decide === 'applied_without_consent' ? (
        <Alert tone="error">Correction appliquée sans l’accord de l’enseignant. La mention reste au journal.</Alert>
      ) : null}

      <PageHeader
        title="Corrections de notes"
        description="Après clôture, une note ne se change que sur demande, et l’enseignant a son mot à dire."
        action={
          <Link href={`/e/${slug}/evaluations`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {aTraiter.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            À votre réponse
            <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--muted)' }}>
              {aTraiter.length}
            </span>
          </h2>
          {aTraiter.map((c) => (
            <CorrectionCard
              key={c.id}
              c={c}
              accept={acceptCorrectionAction.bind(null, slug, c.id)}
              refuse={refuseCorrectionAction.bind(null, slug, c.id)}
            />
          ))}
        </section>
      ) : null}

      {enCours.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">En attente de l’enseignant</h2>
          {enCours.map((c) => (
            <CorrectionCard
              key={c.id}
              c={c}
              {...(force ? { override: overrideCorrectionAction.bind(null, slug, c.id) } : {})}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Journal des corrections</h2>
        {journal.length === 0 ? (
          <EmptyState
            title="Aucune correction"
            hint="Toute correction de note après clôture apparaîtra ici, avec son motif et sa réponse. Rien ne s’y efface."
          />
        ) : (
          <>
            <Card>
              <CardContent className="py-2 text-xs text-[color:var(--muted-foreground)]">
                {(['ACCEPTED', 'REFUSED', 'APPLIED_WITHOUT_CONSENT'] as const).map((s) => (
                  <span key={s} className="mr-4">
                    {CORRECTION_LABELS[s]} : <strong>{journal.filter((c) => c.status === s).length}</strong>
                  </span>
                ))}
              </CardContent>
            </Card>
            {journal.map((c) => (
              <CorrectionCard key={c.id} c={c} />
            ))}
          </>
        )}
      </section>
    </div>
  );
}
