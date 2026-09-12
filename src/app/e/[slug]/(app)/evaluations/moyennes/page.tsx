import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listClasses, listPeriods } from '@/features/evaluations/refs';
import { classRanking } from '@/features/evaluations/averages';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  const base = `/e/${slug}/evaluations`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Moyennes et classement" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }
  const yearId = ctx.academicYear.id;
  const [classes, periods] = await Promise.all([listClasses(ctx, yearId), listPeriods(ctx, yearId)]);

  const classId = typeof sp.class === 'string' ? sp.class : '';
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  const ranking = classId && periodId ? await classRanking(ctx, classId, periodId) : [];

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
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <Button type="submit" variant="secondary" size="sm">Afficher</Button>
          </form>
        </CardContent>
      </Card>

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
