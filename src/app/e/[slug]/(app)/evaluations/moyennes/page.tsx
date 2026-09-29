import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { listClasses, listPeriods, classProgramme } from '@/features/evaluations/refs';
import { periodsForTrack } from '@/features/academic-years/periods-by-track';
import { classRanking } from '@/features/evaluations/averages';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Moyennes et classement' };

export default async function AveragesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'grades.view_all');
  requireFeature(ctx, 'grades');
  const base = `/e/${slug}/evaluations`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Moyennes et classement" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }
  const yearId = ctx.academicYear.id;
  const [classes, periods] = await Promise.all([listClasses(ctx, yearId), listPeriods(ctx, yearId)]);

  const classId = typeof sp.class === 'string' ? sp.class : '';
  // Un bulletin ne mélange jamais deux ordres d'enseignement : la classe choisie
  // commande le découpage (trimestres du général, semestres du technique et du
  // professionnel). Une période d'un autre ordre est ignorée.
  const chosenClass = classes.find((c) => c.id === classId);
  const shownPeriods = chosenClass ? periodsForTrack(periods, chosenClass.track) : periods;
  const askedPeriod = typeof sp.period === 'string' ? sp.period : '';
  const periodId = shownPeriods.some((p) => p.id === askedPeriod) ? askedPeriod : '';
  const [ranking, programme] = classId && periodId
    ? await Promise.all([classRanking(ctx, classId, periodId), classProgramme(ctx, classId)])
    : [[], { subjects: 0, totalCoefficient: 0 }];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Moyennes et classement"
        description={`Année ${ctx.academicYear.name}`}
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="class" className="mb-1 block text-sm font-medium">Classe</label>
              <select id="class" name="class" defaultValue={classId} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm">
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="period" className="mb-1 block text-sm font-medium">Période</label>
              <select id="period" name="period" defaultValue={periodId} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm">
                <option value="">—</option>
                {shownPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <Button type="submit" variant="secondary" size="sm">Afficher</Button>
          </form>
        </CardContent>
      </Card>

      {classId && periodId && programme.subjects === 0 ? (
        <Alert tone="error">
          Le programme du niveau de cette classe n’est pas saisi : aucune matière, aucun coefficient. La moyenne
          générale est pondérée par ces coefficients — sans eux, elle n’est pas calculable, et personne n’est classé.
          Renseignez « Matières par niveau » dans la structure de l’établissement.
        </Alert>
      ) : null}

      {classId && periodId ? (
        ranking.length === 0 ? (
          <EmptyState title="Aucune moyenne" hint="Aucune note clôturée ou publiée pour cette classe et cette période." />
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 w-16 text-center">Rang</th>
                  <th className="px-3 py-2">Matricule</th>
                  <th className="px-3 py-2">Élève</th>
                  <th className="px-3 py-2 text-right">Moyenne générale</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.studentId} className="border-t">
                    <td className="px-3 py-2 text-center font-medium">{r.rank ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right font-medium">{r.average != null ? r.average.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <p className="text-sm text-[color:var(--muted-foreground)]">Choisissez une classe et une période.</p>
      )}
    </div>
  );
}
