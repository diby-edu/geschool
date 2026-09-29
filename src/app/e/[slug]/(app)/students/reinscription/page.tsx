import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { createClient } from '@/lib/supabase/server';
import { listYears } from '@/features/academic-years/queries';
import { listYearClasses } from '@/features/assignments/queries';
import { reenrollCandidates } from '@/features/students/reenrollment';
import { reenrollAction } from '@/features/students/actions';
import { ReenrollForm } from '@/features/students/components/ReenrollForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Réinscription' };

/**
 * Faire monter une classe à l'année suivante.
 *
 * Deux choix d'abord — quelle classe part, vers quelle année — puis la liste
 * des élèves, cochée d'avance. Une inscription existe par année : celle qui se
 * termine reste intacte, avec ses notes et ses bulletins.
 */
export default async function ReenrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.create');
  const base = `/e/${slug}/students`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Réinscription" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }

  const one = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };

  const years = await listYears(ctx);
  // L'annee d'arrivee est une AUTRE annee que celle en cours : on ne reinscrit
  // pas dans l'annee qu'on est en train de terminer.
  const targets = years.filter((y) => y.id !== ctx.academicYear!.id);
  const targetYearId = targets.some((y) => y.id === one('annee')) ? one('annee') : '';
  const fromClassId = one('source');

  const supabase = await createClient();
  const { data: sourceClasses } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', ctx.academicYear.id)
    .order('name');

  const [targetClasses, candidates] = await Promise.all([
    targetYearId ? listYearClasses(ctx, targetYearId) : Promise.resolve([]),
    fromClassId && targetYearId ? reenrollCandidates(ctx, fromClassId, targetYearId) : Promise.resolve([]),
  ]);

  const enrolled = one('inscrits');
  const skipped = one('ignores');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {enrolled ? (
        <Alert tone="success">
          {enrolled} élève(s) réinscrit(s){Number(skipped) > 0 ? `, ${skipped} déjà inscrit(s) et ignoré(s)` : ''}.
        </Alert>
      ) : null}

      <PageHeader
        title="Réinscription"
        description={`Faire monter une classe de ${ctx.academicYear.name} à l’année suivante.`}
        action={
          <Link href={base} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      {targets.length === 0 ? (
        <EmptyState
          title="Aucune autre année scolaire"
          hint="Créez l’année suivante avant de réinscrire."
          action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }}
        />
      ) : (
        <>
          <Card>
            <CardContent>
              <form method="get" className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Classe de départ
                  <select
                    name="source"
                    defaultValue={fromClassId}
                    className="mt-1 block h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="">—</option>
                    {(sourceClasses ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Année d’arrivée
                  <select
                    name="annee"
                    defaultValue={targetYearId}
                    className="mt-1 block h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="">—</option>
                    {targets.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary">
                  Afficher
                </Button>
              </form>
            </CardContent>
          </Card>

          {fromClassId && targetYearId ? (
            candidates.length === 0 ? (
              <EmptyState title="Aucun élève" hint="Cette classe n’a aucun élève à réinscrire." />
            ) : targetClasses.length === 0 ? (
              <Alert tone="error">
                L’année d’arrivée n’a aucune classe. Créez-les avant de réinscrire.
              </Alert>
            ) : (
              <Card>
                <CardContent>
                  <ReenrollForm
                    action={reenrollAction.bind(null, slug)}
                    candidates={candidates}
                    classes={targetClasses}
                    targetYearId={targetYearId}
                    fromClassId={fromClassId}
                  />
                </CardContent>
              </Card>
            )
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Choisissez la classe qui monte et l’année d’arrivée.
            </p>
          )}
        </>
      )}
    </div>
  );
}
