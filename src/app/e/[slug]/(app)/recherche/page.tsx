import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { search, type SearchHit } from '@/features/navigation/search';
import { SEARCH_PERMISSIONS } from '@/features/navigation/top-bar';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Recherche' };

/** Résultats de la recherche de la barre du haut : élèves, enseignants, personnel. */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, [...SEARCH_PERMISSIONS]);

  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? '';
  const results = await search(ctx, q);
  const groups: { label: string; hits: SearchHit[] | null }[] = [
    { label: 'Élèves', hits: results.students },
    { label: 'Enseignants', hits: results.teachers },
    { label: 'Personnel', hits: results.staff },
  ];
  const total = groups.reduce((n, g) => n + (g.hits?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Recherche" description={q ? `Résultats pour « ${q} »` : 'Cherchez un élève, un enseignant ou un membre du personnel.'} />

      {q.length < 2 ? (
        <EmptyState title="Tapez au moins deux lettres" hint="Nom, prénom, matricule ou numéro de personnel." />
      ) : total === 0 ? (
        <EmptyState title="Aucun résultat" hint={`Rien ne correspond à « ${q} » dans ce que vous avez le droit de consulter.`} />
      ) : (
        groups
          .filter((g) => g.hits && g.hits.length > 0)
          .map((g) => (
            <section key={g.label} className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
                {g.label} <span className="tabular-nums">({g.hits!.length})</span>
              </h2>
              <ul className="space-y-2">
                {g.hits!.map((hit) => (
                  <li key={`${g.label}-${hit.id}`}>
                    <Link href={hit.href}>
                      <Card>
                        <CardContent className="flex items-center justify-between gap-3 py-3">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{hit.name}</span>
                            <span className="block truncate text-xs text-[color:var(--muted-foreground)]">{hit.detail}</span>
                          </span>
                          <span aria-hidden className="text-[color:var(--muted-foreground)]">→</span>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
