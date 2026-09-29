import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listSessions } from '@/features/schedule/sessions';
import { getVersion } from '@/features/schedule/versions';

export const metadata: Metadata = { title: 'Comparer les variantes' };

/**
 * Plusieurs emplois du temps valides, côte à côte.
 *
 * Toutes respectent les mêmes règles obligatoires : ce qui les distingue, ce
 * sont les préférences sacrifiées. L'école choisit sur pièces au lieu de subir
 * la première solution venue.
 */
export default async function VariantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.view');

  const raw = typeof sp.ids === 'string' ? sp.ids : '';
  const ids = raw.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 5);

  const variants = await Promise.all(
    ids.map(async (id, i) => {
      const [version, sessions] = await Promise.all([getVersion(ctx, id), listSessions(ctx, id)]);
      return { id, rank: i + 1, version, sessions };
    }),
  );
  const found = variants.filter((v) => v.version);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Comparer les variantes"
        description="Plusieurs emplois du temps valides. Ils respectent tous vos règles obligatoires — seules les préférences les distinguent."
        action={
          <Link href={`/e/${slug}/schedule`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour à l’emploi du temps
          </Link>
        }
      />

      {found.length === 0 ? (
        <EmptyState
          title="Aucune variante à comparer"
          hint="Relancez une génération en demandant plusieurs variantes."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {found.map((v) => {
            const locked = v.sessions.filter((s) => s.is_locked).length;
            return (
              <li key={v.id}>
                <Card>
                  <CardContent className="space-y-2 py-4">
                    <p className="text-sm font-semibold">
                      Variante {v.rank} · {v.version!.name}
                    </p>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-[color:var(--muted-foreground)]">Séances placées</dt>
                        <dd className="font-semibold tabular-nums">{v.sessions.length}</dd>
                      </div>
                      {locked > 0 ? (
                        <div className="flex justify-between">
                          <dt className="text-[color:var(--muted-foreground)]">Dont figées</dt>
                          <dd className="font-semibold tabular-nums">{locked}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <Link href={`/e/${slug}/schedule/${v.id}`}>
                      <Button variant="secondary">Ouvrir cette variante</Button>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Chaque variante est une version brouillon. Publiez celle que vous retenez, et supprimez les autres depuis la
        liste des versions — elles n’encombrent rien tant qu’elles restent brouillons.
      </p>
    </div>
  );
}
