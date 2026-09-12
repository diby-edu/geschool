import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listAssessments, statusLabel } from '@/features/evaluations/assessments';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Évaluations' };

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'text-[color:var(--muted-foreground)]',
  OPEN: 'text-[color:var(--color-brand)]',
  CLOSED: 'text-[color:var(--foreground)]',
  PUBLISHED: 'text-[color:var(--color-success,green)]',
};

export default async function EvaluationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assessments.view');
  const base = `/e/${slug}/evaluations`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Évaluations" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }

  const assessments = await listAssessments(ctx, ctx.academicYear.id);
  const canCreate = hasPermission(ctx, 'assessments.create');
  const canConfig = hasPermission(ctx, 'grading.manage_scales') || hasPermission(ctx, 'grading.manage_settings');
  const canRank = hasPermission(ctx, 'grades.view_all');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Évaluations"
        description={`Année ${ctx.academicYear.name}`}
        action={
          <div className="flex items-center gap-2">
            {canRank ? <Link href={`${base}/moyennes`}><Button variant="ghost">Moyennes</Button></Link> : null}
            {canConfig ? <Link href={`${base}/config`}><Button variant="secondary">Barèmes &amp; types</Button></Link> : null}
            {canCreate ? <Link href={`${base}/new`}><Button>Nouvelle évaluation</Button></Link> : null}
          </div>
        }
      />

      {assessments.length === 0 ? (
        <EmptyState
          title="Aucune évaluation"
          hint="Créez une évaluation pour commencer la saisie des notes."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Titre</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Période</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-center">Notes</th>
                <th className="px-3 py-2">État</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} className="border-t hover:bg-[color:var(--muted)]/40">
                  <td className="px-3 py-2">
                    <Link href={`${base}/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                  </td>
                  <td className="px-3 py-2">{a.klass}</td>
                  <td className="px-3 py-2">{a.subject}</td>
                  <td className="px-3 py-2">{a.type}</td>
                  <td className="px-3 py-2">{a.period}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.assessment_date}</td>
                  <td className="px-3 py-2 text-center">{a.graded}</td>
                  <td className={`px-3 py-2 ${STATUS_TONE[a.status] ?? ''}`}>{statusLabel(a.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
