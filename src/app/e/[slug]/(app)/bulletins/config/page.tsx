import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { readReportingSettings } from '@/features/reporting/settings';
import { listGradingPeriods, periodShape } from '@/features/reporting/periods';
import {
  saveSubjectTiersAction,
  saveMentionsAction,
  saveDecisionsAction,
  savePeriodWeightsAction,
} from '@/features/reporting/actions';
import { TiersForm } from '@/features/reporting/components/TiersForm';
import { DecisionsForm } from '@/features/reporting/components/DecisionsForm';
import { PeriodWeightsForm } from '@/features/reporting/components/PeriodWeightsForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Règles d’écriture des bulletins' };

const CONFIRMATIONS: Record<string, string> = {
  matieres: 'Appréciations par matière enregistrées.',
  mentions: 'Mentions de période enregistrées.',
  annee: 'Mentions de l’année enregistrées.',
  decisions: 'Décisions de fin d’année enregistrées.',
  coefficients: 'Calcul de la moyenne annuelle enregistré.',
};

export default async function ReportingConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'settings.update');
  requireFeature(ctx, 'bulletins');
  const base = `/e/${slug}/bulletins`;

  const settings = await readReportingSettings(ctx);
  const periods = ctx.academicYear ? await listGradingPeriods(ctx, ctx.academicYear.id) : [];
  const shape = periodShape(periods);

  const confirme = typeof sp.enregistre === 'string' ? CONFIRMATIONS[sp.enregistre] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      {confirme ? <Alert tone="success">{confirme}</Alert> : null}

      <PageHeader
        title="Règles d’écriture des bulletins"
        description="Aucune appréciation n’est tapée à la main : chacune sort d’un palier de moyenne, que vous fixez ici."
        action={
          <Link href={base}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent>
          <TiersForm
            action={saveSubjectTiersAction.bind(null, slug)}
            tiers={settings.subjectTiers}
            title="Appréciation par matière"
            hint="Le mot écrit dans la colonne « Appréciation », en face de chaque matière. Un mot, pas une phrase."
            exemple="Une moyenne de 13,25 en mathématiques s’écrira « Assez bien » avec les seuils ci-dessus."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TiersForm
            action={saveMentionsAction.bind(null, slug, 'term')}
            tiers={settings.termMentions}
            withCode
            title="Mention de la période"
            hint="Calculée sur la moyenne générale de la période. Elle ouvre aussi l’appréciation du conseil de classe, que le professeur principal complète ensuite."
            exemple="Une moyenne générale de 13,13 donnera « Encouragements du conseil »."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TiersForm
            action={saveMentionsAction.bind(null, slug, 'year')}
            tiers={settings.yearMentions}
            withCode
            title="Mention de l’année"
            hint="Calculée sur la moyenne annuelle, et imprimée sur le seul dernier bulletin de l’année. C’est là qu’on parle de tableau d’honneur."
            exemple="Ces seuils peuvent être plus exigeants que ceux d’une période : c’est le bilan de toute l’année."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {ctx.academicYear ? (
            <PeriodWeightsForm
              action={savePeriodWeightsAction.bind(null, slug)}
              weights={settings.periodWeights}
              periodCount={shape.count}
              periodNames={shape.names}
            />
          ) : (
            <Alert tone="info">
              Activez une année scolaire pour régler le calcul de la moyenne annuelle : c’est elle qui donne le nombre
              de périodes.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <DecisionsForm action={saveDecisionsAction.bind(null, slug)} decisions={settings.decisions} />
        </CardContent>
      </Card>
    </div>
  );
}
