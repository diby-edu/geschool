import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getMyTaughtClasses, getMySubjectsForClass } from '@/features/teachers/my-scope';
import { listPeriods } from '@/features/evaluations/refs';
import { listAssessments, statusLabel } from '@/features/evaluations/assessments';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Notes & Évaluations' };

export default async function MyClassEvaluationsPage({
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

  // La classe doit reellement etre la sienne (perimetre reel, teaching_assignments) :
  // jamais de confirmation d'existence d'une classe qui ne lui appartient pas.
  const classes = await getMyTaughtClasses(ctx);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();

  const [periods, subjects] = await Promise.all([listPeriods(ctx, yearId), getMySubjectsForClass(ctx, classId)]);
  if (periods.length === 0) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={klass.name} action={<Link href={`/e/${slug}/evaluations`}><Button variant="ghost">Retour</Button></Link>} />
        <EmptyState title="Aucune période de notation" hint="Configurez les périodes de l'année scolaire d'abord." />
      </div>
    );
  }

  // A defaut de choix explicite, la derniere periode (sequence la plus
  // elevee) : une meilleure approximation de « la periode en cours » que la
  // premiere, sans dependance a une notion de date ici (refs.ts ne renvoie
  // que id/nom).
  const requested = typeof sp.period === 'string' ? sp.period : null;
  const activeTab = requested === 'annual' ? 'annual' : requested && periods.some((p) => p.id === requested) ? requested : (periods[periods.length - 1]?.id ?? null);

  const assessments = activeTab && activeTab !== 'annual' ? await listAssessments(ctx, yearId, { periodId: activeTab, classId }) : [];
  const canCalculate = subjects.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title={klass.name}
        {...(klass.level ? { description: klass.level } : {})}
        action={<Link href={`/e/${slug}/evaluations`}><Button variant="ghost">Mes classes</Button></Link>}
      />

      <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`${base}?period=${p.id}`}
            className="rounded-t-[--radius-card] px-3 py-2 text-sm font-medium"
            style={
              activeTab === p.id
                ? { color: 'var(--color-brand)', borderBottom: '2px solid var(--color-brand)' }
                : { color: 'var(--muted-foreground)' }
            }
          >
            {p.name}
          </Link>
        ))}
        <Link
          href={`${base}?period=annual`}
          className="rounded-t-[--radius-card] px-3 py-2 text-sm font-medium"
          style={
            activeTab === 'annual'
              ? { color: 'var(--color-brand)', borderBottom: '2px solid var(--color-brand)' }
              : { color: 'var(--muted-foreground)' }
          }
        >
          Annuel
        </Link>
      </div>

      {activeTab === 'annual' ? (
        <AnnualPreview slug={slug} classId={classId} subjects={subjects} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[color:var(--muted-foreground)]">{assessments.length} évaluation(s)</p>
            <div className="flex items-center gap-2">
              {canCalculate ? (
                <Link href={`${base}/moyennes?period=${activeTab}${subjects.length === 1 ? `&subject=${subjects[0]!.id}` : ''}`}>
                  <Button variant="secondary">Calculer les moyennes et le classement</Button>
                </Link>
              ) : null}
              <Link href={`${base}/new?period=${activeTab}`}>
                <Button>+ Ajouter une évaluation</Button>
              </Link>
            </div>
          </div>

          {assessments.length === 0 ? (
            <EmptyState title="Aucune évaluation" hint="Créez la première évaluation de cette période." />
          ) : (
            <div className="overflow-x-auto rounded-[--radius-card] border">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2">Titre</th>
                    <th className="px-3 py-2">Matière</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-center">Notes</th>
                    <th className="px-3 py-2">État</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-[color:var(--muted)]/40">
                      <td className="px-3 py-2">
                        <Link href={`/e/${slug}/evaluations/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                      </td>
                      <td className="px-3 py-2">{a.subject}</td>
                      <td className="px-3 py-2">{a.type}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{a.assessment_date}</td>
                      <td className="px-3 py-2 text-center">{a.graded}</td>
                      <td className="px-3 py-2">{statusLabel(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnnualPreview({ slug, classId, subjects }: { slug: string; classId: string; subjects: { id: string; name: string }[] }) {
  const base = `/e/${slug}/evaluations/mine/${classId}/annuel`;
  if (subjects.length === 0) {
    return <EmptyState title="Aucune discipline" hint="Aucune matière ne vous est affectée dans cette classe." />;
  }
  if (subjects.length === 1) {
    return (
      <p className="text-sm text-[color:var(--muted-foreground)]">
        <Link href={`${base}?subject=${subjects[0]!.id}`} className="font-medium text-[color:var(--color-brand)] hover:underline">
          Voir le résultat annuel — {subjects[0]!.name}
        </Link>
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {subjects.map((s) => (
        <li key={s.id}>
          <Link href={`${base}?subject=${s.id}`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
            Résultat annuel — {s.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
