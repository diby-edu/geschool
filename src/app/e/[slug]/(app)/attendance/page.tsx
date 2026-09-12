import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listOccurrences } from '@/features/attendance/occurrences';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Appel et présences' };

const REG_LABEL: Record<string, string> = { OPEN: 'En cours', SUBMITTED: 'Soumis', VALIDATED: 'Validé' };

export default async function AttendancePage({
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

  const today = new Date().toISOString().slice(0, 10);
  const date = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const occurrences = await listOccurrences(ctx, date);

  const canJustify = hasPermission(ctx, 'attendance.justify');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Appel et présences"
        description="Faire l’appel des cours du jour"
        action={
          <div className="flex items-center gap-2">
            <Link href={`${base}/absences`}><Button variant="ghost">Absences</Button></Link>
            {canJustify ? <Link href={`${base}/justificatifs`}><Button variant="secondary">Justificatifs</Button></Link> : null}
          </div>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="flex items-end gap-3">
            <div>
              <label htmlFor="date" className="mb-1 block text-sm font-medium">Jour</label>
              <input id="date" name="date" type="date" defaultValue={date} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm" />
            </div>
            <Button type="submit" variant="secondary" size="sm">Afficher</Button>
          </form>
        </CardContent>
      </Card>

      {occurrences.length === 0 ? (
        <EmptyState
          title="Aucun cours ce jour"
          hint="Les cours proviennent d’un emploi du temps publié. Publiez une version pour générer les séances datées."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Horaire</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Enseignant</th>
                <th className="px-3 py-2">Appel</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{o.starts_at}–{o.ends_at}</td>
                  <td className="px-3 py-2">{o.klass}</td>
                  <td className="px-3 py-2">{o.subject}</td>
                  <td className="px-3 py-2 text-[color:var(--muted-foreground)]">{o.teacher ?? '—'}</td>
                  <td className="px-3 py-2">{o.register_status ? (REG_LABEL[o.register_status] ?? o.register_status) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`${base}/${o.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">
                      {o.register_status ? 'Ouvrir' : 'Faire l’appel'}
                    </Link>
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
