import type { Metadata } from 'next';
import { latestUsage, snapshotMetrics, USAGE_LABELS } from '@/features/platform-usage/service';
import { snapshotUsageAction } from '@/features/platform-usage/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Usage des établissements' };
export const dynamic = 'force-dynamic';

/**
 * Ce que chaque école consomme réellement.
 *
 * La plateforme facture des abonnements ; sans relevé, elle facture à l'aveugle.
 * Le relevé est manuel et daté : on sait toujours de quand datent les chiffres,
 * plutôt que d'afficher un total calculé à la volée dont personne ne sait s'il
 * correspond à la période facturée.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rows = await latestUsage();
  const taken = typeof sp.releve === 'string' ? sp.releve : null;
  const never = rows.every((r) => r.recordedFor === null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {taken ? <Alert tone="success">{taken} mesure(s) relevée(s) aujourd’hui.</Alert> : null}

      <PageHeader
        title="Usage des établissements"
        description="Ce que chaque école consomme, à la date du dernier relevé."
        action={<SimpleSubmit action={snapshotUsageAction} label="Relever maintenant" />}
      />

      {never ? (
        <Alert tone="info">
          Aucun relevé n’a encore été pris. Cliquez sur « Relever maintenant » : les chiffres ci-dessous se
          rempliront, et chaque relevé suivant remplacera celui du même jour.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Aucun établissement" hint="Rien à mesurer pour l’instant." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Établissement</th>
                {snapshotMetrics.map((m) => (
                  <th key={m} className="px-3 py-2 text-right">
                    {USAGE_LABELS[m]}
                  </th>
                ))}
                <th className="px-3 py-2">Relevé le</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.schoolId} className="border-t">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-2 font-mono text-xs text-[color:var(--muted-foreground)]">{r.slug}</span>
                  </td>
                  {snapshotMetrics.map((m) => (
                    <td key={m} className="px-3 py-2 text-right tabular-nums">
                      {r.values[m] === undefined ? '—' : r.values[m]!.toLocaleString('fr-FR')}
                    </td>
                  ))}
                  <td className="px-3 py-2 whitespace-nowrap text-[color:var(--muted-foreground)]">
                    {r.recordedFor ?? 'jamais'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardContent className="py-3">
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Le stockage et les SMS envoyés ne figurent pas ici : ils dépendent de sources extérieures à la base
            (hébergeur, opérateur). Ils seront ajoutés le jour où ces sources seront branchées, plutôt qu’affichés
            à zéro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
