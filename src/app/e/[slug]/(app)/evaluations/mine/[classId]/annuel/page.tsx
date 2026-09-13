import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getMyTaughtClasses, getMySubjectsForClass } from '@/features/teachers/my-scope';
import { computeAnnualConsolidation } from '@/features/evaluations/annual';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Résultat annuel' };

function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

export default async function MyClassAnnualPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, classId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  if (!ctx.academicYear) notFound();
  const base = `/e/${slug}/evaluations/mine/${classId}`;

  const classes = await getMyTaughtClasses(ctx);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();

  const subjects = await getMySubjectsForClass(ctx, classId);
  const subjectId = typeof sp.subject === 'string' ? sp.subject : subjects.length === 1 ? subjects[0]!.id : undefined;
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined;

  if (!subject) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={`Résultat annuel — ${klass.name}`} action={<Link href={`${base}?period=annual`}><Button variant="ghost">Retour</Button></Link>} />
        {subjects.length === 0 ? (
          <EmptyState title="Aucune discipline" hint="Aucune matière ne vous est affectée dans cette classe." />
        ) : (
          <ul className="space-y-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <Link href={`${base}/annuel?subject=${s.id}`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const result = await computeAnnualConsolidation(ctx, classId, subject.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`Résultat annuel — ${klass.name}`}
        description={subject.name}
        action={<Link href={`${base}?period=annual`}><Button variant="ghost">Retour</Button></Link>}
      />

      <Alert tone="info">
        Moyenne annuelle = moyenne des périodes ({result.periods.map((p) => p.name).join(', ') || '—'}) pondérée par le
        poids de chacune (configuration de l&apos;établissement), pas une simple copie d&apos;une période.
      </Alert>

      {result.rows.length === 0 ? (
        <EmptyState title="Aucun élève inscrit" />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Élève</th>
                {result.periods.map((p) => (
                  <th key={p.id} className="px-3 py-2 text-center whitespace-nowrap">{p.name}</th>
                ))}
                <th className="px-3 py-2 text-center">Moyenne annuelle</th>
                <th className="px-3 py-2 text-center">Rang annuel</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.studentId} className="border-t">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>{' '}
                    <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</span>
                  </td>
                  {r.periodAverages.map((v, i) => (
                    <td key={result.periods[i]!.id} className="px-3 py-2 text-center tabular-nums">
                      {v === null ? '—' : v.toLocaleString('fr-FR')}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold tabular-nums">
                    {r.annualAverage === null ? '—' : r.annualAverage.toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">{r.rank === null ? '—' : ordinal(r.rank)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
          Le détail des évaluations reste consultable dans chaque période.
        </CardContent>
      </Card>
    </div>
  );
}
