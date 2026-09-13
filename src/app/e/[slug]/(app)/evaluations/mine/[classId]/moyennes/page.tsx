import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getMyTaughtClasses, getMySubjectsForClass } from '@/features/teachers/my-scope';
import { listPeriods } from '@/features/evaluations/refs';
import { computeLiveRanking } from '@/features/evaluations/live-ranking';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Moyennes et classement' };

function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

export default async function MyClassRankingPage({
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
  const yearId = ctx.academicYear.id;
  const base = `/e/${slug}/evaluations/mine/${classId}`;

  const classes = await getMyTaughtClasses(ctx);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();

  const [subjects, periods] = await Promise.all([getMySubjectsForClass(ctx, classId), listPeriods(ctx, yearId)]);
  const periodId = typeof sp.period === 'string' ? sp.period : undefined;
  const period = periodId ? periods.find((p) => p.id === periodId) : undefined;
  const subjectId = typeof sp.subject === 'string' ? sp.subject : subjects.length === 1 ? subjects[0]!.id : undefined;
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined;

  if (!period) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Moyennes — ${klass.name}`} action={<Link href={base}><Button variant="ghost">Retour</Button></Link>} />
        <EmptyState title="Période manquante" hint="Revenez à l'onglet de la période concernée." />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={`Moyennes — ${klass.name}`} action={<Link href={`${base}?period=${period.id}`}><Button variant="ghost">Retour</Button></Link>} />
        {subjects.length === 0 ? (
          <EmptyState title="Aucune discipline" hint="Aucune matière ne vous est affectée dans cette classe." />
        ) : (
          <ul className="space-y-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <Link href={`${base}/moyennes?period=${period.id}&subject=${s.id}`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const ranking = await computeLiveRanking(ctx, classId, period.id, subject.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`Moyennes et classement — ${klass.name}`}
        description={`${subject.name} · ${period.name}`}
        action={<Link href={`${base}?period=${period.id}`}><Button variant="ghost">Retour</Button></Link>}
      />

      <Alert tone="info">
        Calculé à partir de toutes les évaluations saisies, y compris celles en brouillon. La clôture d&apos;une
        évaluation (réservée à l&apos;administration) gèle sa saisie ; elle ne conditionne pas ce calcul.
      </Alert>

      {ranking.rows.length === 0 ? (
        <EmptyState title="Aucun élève inscrit" />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Élève</th>
                {ranking.assessments.map((a) => (
                  <th key={a.id} className="px-3 py-2 text-center whitespace-nowrap" title={`Sur ${a.maxScore}`}>
                    {a.title}
                  </th>
                ))}
                <th className="px-3 py-2 text-center">Moyenne</th>
                <th className="px-3 py-2 text-center">Rang</th>
              </tr>
            </thead>
            <tbody>
              {ranking.rows.map((r) => (
                <tr key={r.studentId} className="border-t">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>{' '}
                    <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</span>
                  </td>
                  {r.scores.map((sc, i) => (
                    <td key={ranking.assessments[i]!.id} className="px-3 py-2 text-center tabular-nums">
                      {sc === null ? '—' : sc}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold tabular-nums">{r.average === null ? '—' : r.average.toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-2 text-center font-semibold">{r.rank === null ? '—' : ordinal(r.rank)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
          {ranking.assessments.length} évaluation(s) prise(s) en compte dans cette matière pour cette période.
        </CardContent>
      </Card>
    </div>
  );
}
