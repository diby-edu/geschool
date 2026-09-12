import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listAbsences } from '@/features/attendance/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Absences et retards' };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'attendance.view');
  const base = `/e/${slug}/attendance`;

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600_000);
  const from = typeof sp.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : iso(monthAgo);
  const to = typeof sp.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : iso(today);
  const rows = await listAbsences(ctx, { from, to });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Absences et retards"
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="from" className="mb-1 block text-sm font-medium">Du</label>
              <input id="from" name="from" type="date" defaultValue={from} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-sm font-medium">Au</label>
              <input id="to" name="to" type="date" defaultValue={to} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm" />
            </div>
            <Button type="submit" variant="secondary" size="sm">Afficher</Button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Aucune absence ni retard" hint="Sur la période choisie." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Élève</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2">{r.student}</td>
                  <td className="px-3 py-2">{r.klass}</td>
                  <td className="px-3 py-2">{r.subject}</td>
                  <td className="px-3 py-2">{r.status === 'ABSENT' ? 'Absent' : 'Retard'}</td>
                  <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
                    {r.status === 'LATE' ? `${r.minutes_late} min` : ''}{r.comment ? ` · ${r.comment}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
