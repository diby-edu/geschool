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
import { StudentAvatar } from '@/components/ui/student-avatar';

export const metadata: Metadata = { title: 'Moyennes et classement' };

const MEDAL_COLOR: Record<number, string> = {
  1: 'oklch(0.75 0.15 85)',
  2: 'oklch(0.75 0.01 250)',
  3: 'oklch(0.62 0.13 55)',
};

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
        // Meme ecran que la saisie des notes (meme avatar, meme ordre
        // alphabetique, meme ligne par eleve) : seule la note editable devient
        // Moyenne + Rang, en lecture seule.
        <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          {ranking.rows.map((r) => (
            <li key={r.studentId} className="flex items-center gap-3 px-3 py-2.5">
              <StudentAvatar name={r.name} photoUrl={r.photoUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold tabular-nums">{r.average === null ? '—' : r.average.toLocaleString('fr-FR')}</span>
                <span className="block text-xs text-[color:var(--muted-foreground)]">/ 20</span>
              </span>
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: r.rank && MEDAL_COLOR[r.rank] ? MEDAL_COLOR[r.rank] : 'var(--muted-foreground)' }}
              >
                {r.rank ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
          {ranking.assessments.length} évaluation(s) prise(s) en compte dans cette matière pour cette période.
        </CardContent>
      </Card>
    </div>
  );
}
