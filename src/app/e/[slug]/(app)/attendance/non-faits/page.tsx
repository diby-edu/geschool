import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listMissingCalls, readGapReasons, MAX_WINDOW_DAYS, windowProblem } from '@/features/attendance/gaps';
import { summarizeByTeacher } from '@/features/attendance/gap-types';
import { qualifyGapAction, clearGapAction } from '@/features/attendance/gap-actions';
import { MissingCalls } from '@/features/attendance/components/MissingCalls';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Appels non faits' };
export const dynamic = 'force-dynamic';

/** Par défaut, la semaine écoulée : au-delà, plus personne ne se souvient. */
const FENETRE_PAR_DEFAUT = 7;

/** Sans filtre, on ne déroule que les plus récents : le reste se lit par enseignant. */
const DETAIL_SANS_FILTRE = 40;

function jour(decalage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
}

export default async function MissingCallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['attendance.missing_calls', 'attendance.view_all']);
  requireFeature(ctx, 'attendance');

  const from = typeof sp.du === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.du) ? sp.du : jour(-FENETRE_PAR_DEFAUT);
  const to = typeof sp.au === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.au) ? sp.au : jour(0);
  const probleme = windowProblem(from, to);

  const [toutes, reasons] = probleme
    ? [[], await readGapReasons(ctx)]
    : await Promise.all([listMissingCalls(ctx, from, to), readGapReasons(ctx)]);

  // Sur une semaine, un etablissement entier produit des centaines de lignes :
  // on commence par QUI, et on ouvre ensuite le detail d'une personne.
  const resume = summarizeByTeacher(toutes);
  const prof = typeof sp.prof === 'string' ? sp.prof : null;
  const rows = prof ? toutes.filter((r) => (r.teacherId ?? '—') === prof) : toutes.slice(0, DETAIL_SANS_FILTRE);
  const tronque = !prof && toutes.length > DETAIL_SANS_FILTRE;
  const periode = new URLSearchParams({ du: from, au: to });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {sp.qualifie ? <Alert tone="success">Créneau qualifié.</Alert> : null}
      {sp.efface ? <Alert tone="success">Qualification retirée.</Alert> : null}

      <PageHeader
        title="Appels non faits"
        description="Les cours terminés dont l’appel n’a pas été soumis."
        action={
          <Link href={`/e/${slug}/attendance`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="du" className="mb-1 block text-sm font-medium">
                Du
              </label>
              <input
                id="du"
                name="du"
                type="date"
                defaultValue={from}
                className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="au" className="mb-1 block text-sm font-medium">
                Au
              </label>
              <input
                id="au"
                name="au"
                type="date"
                defaultValue={to}
                className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Afficher
            </Button>
            <span className="text-xs text-[color:var(--muted-foreground)]">
              Au plus {MAX_WINDOW_DAYS} jours à la fois.
            </span>
          </form>
        </CardContent>
      </Card>

      {probleme ? null : resume.length > 0 ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold">Par enseignant</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="py-1.5">Enseignant</th>
                    <th className="py-1.5 text-center">Sans appel</th>
                    <th className="py-1.5 text-center">À vérifier</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {resume.map((r) => (
                    <tr key={r.teacherId ?? '—'} className="border-b">
                      <td className="py-1.5">{r.teacher}</td>
                      <td className="py-1.5 text-center tabular-nums">{r.total}</td>
                      <td
                        className="py-1.5 text-center tabular-nums"
                        style={r.pending > 0 ? { color: 'var(--color-warning)' } : undefined}
                      >
                        {r.pending}
                      </td>
                      <td className="py-1.5 text-right">
                        <Link
                          href={`?${periode.toString()}&prof=${encodeURIComponent(r.teacherId ?? '—')}`}
                          className="text-xs text-[color:var(--color-brand)] hover:underline"
                        >
                          Voir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Le nombre de créneaux sans appel ne dit pas la faute : il dit ce qu’il reste à vérifier.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {prof ? (
        <p className="text-sm">
          <Link href={`?${periode.toString()}`} className="text-[color:var(--color-brand)] hover:underline">
            ← Tous les enseignants
          </Link>
        </p>
      ) : null}

      {probleme ? (
        <Alert tone="error">{probleme}</Alert>
      ) : (
        <MissingCalls
          rows={rows}
          reasons={reasons}
          qualify={qualifyGapAction.bind(null, slug)}
          clear={clearGapAction.bind(null, slug)}
          canQualify={hasPermission(ctx, 'attendance.missing_calls') && ctx.school.status === 'ACTIVE'}
          from={from}
          to={to}
          prof={prof}
        />
      )}

      {tronque ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          {toutes.length - DETAIL_SANS_FILTRE} autres créneaux ne sont pas affichés ici. Ouvrez un enseignant
          ci-dessus, ou resserrez la période.
        </p>
      ) : null}
    </div>
  );
}
