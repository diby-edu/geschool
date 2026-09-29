import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listAssessments, statusLabel, type AssessmentStatus } from '@/features/evaluations/assessments';
import { listPeriods } from '@/features/academic-years/queries';
import { listYearClasses, listActiveSubjects } from '@/features/assignments/queries';
import { bulkTransitionAction } from '@/features/evaluations/actions';
import { AssessmentFilters, BulkSelectionForm } from '@/features/evaluations/components/AssessmentAdmin';
import { parseListParams, pageCount, mergeQuery } from '@/lib/query/list';
import { getMyTaughtClasses } from '@/features/teachers/my-scope';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Notes & Évaluations' };

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
  requireFeature(ctx, 'grades');
  const base = `/e/${slug}/evaluations`;

  // Enseignant sans vision d'ensemble (censeur/direction — grades.view_all) :
  // il choisit d'abord SA classe, jamais la liste plate de tout
  // l'etablissement (cahier des charges §3.1).
  const isPlainTeacher = !hasPermission(ctx, 'grades.view_all') && (ctx.membership?.roles ?? []).includes('TEACHER');
  if (isPlainTeacher) {
    const classes = await getMyTaughtClasses(ctx);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Notes & Évaluations" {...(ctx.academicYear ? { description: `Année ${ctx.academicYear.name}` } : {})} />
        {classes.length === 0 ? (
          <EmptyState title="Aucune classe" hint="Aucune classe ne vous est encore affectée." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/mine/${c.id}`}>
                  <Card className="transition hover:border-[color:var(--color-brand)]">
                    <CardContent className="py-4">
                      <p className="font-semibold">{c.name}</p>
                      {c.level ? <p className="text-xs text-[color:var(--muted-foreground)]">{c.level}</p> : null}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Notes & Évaluations" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }

  const yearId = ctx.academicYear.id;
  const pick = (k: string): string | undefined => {
    const v = sp[k];
    const first = Array.isArray(v) ? v[0] : v;
    return first && first.trim() !== '' ? first.trim() : undefined;
  };
  const filters = {
    ...(pick('periode') ? { periodId: pick('periode')! } : {}),
    ...(pick('classe') ? { classId: pick('classe')! } : {}),
    ...(pick('matiere') ? { subjectId: pick('matiere')! } : {}),
    ...(pick('etat') ? { status: pick('etat') as AssessmentStatus } : {}),
  };
  const lp = parseListParams(sp, { sortable: [], pageSize: 50 });
  // 10 000 evaluations par an dans une vraie ecole : on n'en lit qu'une page.
  const [{ rows: assessments, total }, periods, classes, subjects] = await Promise.all([
    listAssessments(ctx, yearId, filters, { from: lp.from, to: lp.to }),
    listPeriods(ctx, yearId),
    listYearClasses(ctx, yearId),
    listActiveSubjects(ctx),
  ]);
  const pages = pageCount(total, lp.pageSize);
  const canCreate = hasPermission(ctx, 'assessments.create');
  const canValidate = hasPermission(ctx, 'grades.validate');
  const canPublish = hasPermission(ctx, 'grades.publish');
  const canConfig = hasPermission(ctx, 'grading.manage_scales') || hasPermission(ctx, 'grading.manage_settings');
  const canRank = hasPermission(ctx, 'grades.view_all');

  const table = (
    <div className="overflow-x-auto rounded-[--radius-card] border">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
          <tr>
            {canValidate || canPublish ? <th className="w-8 px-3 py-2" aria-label="Sélection" /> : null}
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
              {canValidate || canPublish ? (
                <td className="px-3 py-2">
                  <input type="checkbox" name="ids" value={a.id} className="size-4" aria-label={`Sélectionner ${a.title}`} />
                </td>
              ) : null}
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
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Notes & Évaluations"
        description={`Année ${ctx.academicYear.name}`}
        action={
          <div className="flex items-center gap-2">
            {canRank ? <Link href={`${base}/moyennes`}><Button variant="ghost">Moyennes</Button></Link> : null}
            {canConfig ? <Link href={`${base}/config`}><Button variant="secondary">Barèmes &amp; types</Button></Link> : null}
            {canCreate ? <Link href={`${base}/new`}><Button>Nouvelle évaluation</Button></Link> : null}
          </div>
        }
      />

      <AssessmentFilters
        basePath={base}
        searchParams={sp}
        periods={periods.map((p) => ({ id: p.id, name: p.name }))}
        classes={classes}
        subjects={subjects}
      />

      {sp.lot !== undefined ? (
        <Alert tone="success">{sp.lot} évaluation(s) mise(s) à jour.</Alert>
      ) : null}

      {assessments.length === 0 ? (
        <EmptyState
          title="Aucune évaluation"
          hint={
            Object.keys(filters).length > 0
              ? 'Aucune évaluation ne correspond à ce filtre.'
              : 'Créez une évaluation pour commencer la saisie des notes.'
          }
        />
      ) : (
        canValidate || canPublish ? (
          <BulkSelectionForm
            closeAction={bulkTransitionAction.bind(null, slug, 'close', 'selection')}
            publishAction={canPublish ? bulkTransitionAction.bind(null, slug, 'publish', 'selection') : null}
            closeFilterAction={bulkTransitionAction.bind(null, slug, 'close', 'filter')}
            total={total}
            back={`${base}${mergeQuery(sp, {})}`}
            filters={{
              periodId: filters.periodId ?? '',
              classId: filters.classId ?? '',
              subjectId: filters.subjectId ?? '',
              status: filters.status ?? '',
            }}
          >
            {table}
          </BulkSelectionForm>
        ) : (
          table
        )
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-[color:var(--muted-foreground)]">
            Page {lp.page} sur {pages} · {total} évaluation(s)
          </span>
          <span className="flex gap-3">
            {lp.page > 1 ? (
              <Link href={`${base}${mergeQuery(sp, { page: lp.page - 1 })}`} className="hover:underline">
                Précédent
              </Link>
            ) : null}
            {lp.page < pages ? (
              <Link href={`${base}${mergeQuery(sp, { page: lp.page + 1 })}`} className="hover:underline">
                Suivant
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
