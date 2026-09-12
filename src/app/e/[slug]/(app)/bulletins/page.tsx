import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listClasses, listPeriods } from '@/features/evaluations/refs';
import { listBulletins, BULLETIN_STATUS } from '@/features/bulletins/queries';
import {
  generateBulletinsAction,
  validateBulletinsAction,
  publishBulletinsAction,
  unpublishBulletinsAction,
} from '@/features/bulletins/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Bulletins' };

export default async function BulletinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'reports.view');
  const base = `/e/${slug}/bulletins`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Bulletins" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }
  const yearId = ctx.academicYear.id;
  const [classes, periods] = await Promise.all([listClasses(ctx, yearId), listPeriods(ctx, yearId)]);

  const classId = typeof sp.class === 'string' ? sp.class : '';
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  const bulletins = classId && periodId ? await listBulletins(ctx, classId, periodId) : [];

  const canGenerate = hasPermission(ctx, 'reports.generate');
  const canValidate = hasPermission(ctx, 'reports.validate');
  const canPublish = hasPermission(ctx, 'reports.publish');
  const anyPublished = bulletins.some((b) => b.status === 'PUBLISHED');
  const anyGenerated = bulletins.some((b) => b.status === 'GENERATED');
  const anyValidated = bulletins.some((b) => b.status === 'VALIDATED');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {sp.generated !== undefined ? <Alert tone="success">{sp.generated} bulletin(s) généré(s).</Alert> : null}
      {sp.validated !== undefined ? <Alert tone="success">{sp.validated} bulletin(s) validé(s).</Alert> : null}
      {sp.published !== undefined ? <Alert tone="success">{sp.published} bulletin(s) publié(s).</Alert> : null}
      {sp.unpublished !== undefined ? <Alert tone="info">{sp.unpublished} bulletin(s) dépublié(s).</Alert> : null}

      <PageHeader title="Bulletins" description={`Année ${ctx.academicYear.name}`} />

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
        <>
          <div className="flex flex-wrap items-center gap-2">
            {canGenerate ? (
              <SimpleSubmit
                action={generateBulletinsAction.bind(null, slug, classId, periodId)}
                label={bulletins.length > 0 ? 'Régénérer' : 'Générer les bulletins'}
                small
              />
            ) : null}
            {canValidate && anyGenerated ? (
              <SimpleSubmit action={validateBulletinsAction.bind(null, slug, classId, periodId)} label="Valider (conseil)" small />
            ) : null}
            {canPublish && (anyValidated || anyGenerated) ? (
              <SimpleSubmit action={publishBulletinsAction.bind(null, slug, classId, periodId)} label="Publier" small />
            ) : null}
            {canPublish && anyPublished ? (
              <SimpleSubmit action={unpublishBulletinsAction.bind(null, slug, classId, periodId)} label="Dépublier" small />
            ) : null}
          </div>

          {bulletins.length === 0 ? (
            <EmptyState title="Aucun bulletin" hint="Générez les bulletins pour cette classe et cette période." />
          ) : (
            <div className="overflow-x-auto rounded-[--radius-card] border">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 w-16 text-center">Rang</th>
                    <th className="px-3 py-2">Matricule</th>
                    <th className="px-3 py-2">Élève</th>
                    <th className="px-3 py-2 text-right">Moyenne</th>
                    <th className="px-3 py-2">État</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {bulletins.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 text-center font-medium">{b.rank ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[color:var(--muted-foreground)]">{b.matricule}</td>
                      <td className="px-3 py-2">{b.student}</td>
                      <td className="px-3 py-2 text-right font-medium">{b.general_average != null ? b.general_average.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2">{BULLETIN_STATUS[b.status] ?? b.status}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`${base}/${b.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">Voir</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-[color:var(--muted-foreground)]">Choisissez une classe et une période.</p>
      )}
    </div>
  );
}
