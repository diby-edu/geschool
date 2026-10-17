import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { listBulletinsForPrint, listClassesForBulletinPrint } from '@/features/bulletins/queries';
import { listPeriods } from '@/features/evaluations/refs';
import { bulletinRender } from '@/features/bulletins/render';
import { BulletinView } from '@/features/bulletins/components/BulletinView';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Bulletins à imprimer' };

/**
 * Une ou plusieurs classes, prêtes à sortir en PDF.
 *
 * Pas de fichier fabriqué sur le serveur : la page est mise en forme pour l'A4
 * et l'impression du navigateur produit le PDF. Un bulletin par feuille,
 * strictement le même que celui affiché à l'écran et vu par la famille.
 *
 * Plafond : MAX_CLASSES classes par téléchargement. Une classe de 50 bulletins
 * pèse ~1,8 Mo de page ; tout un établissement (80 classes) dépasserait ce que
 * le navigateur sait imprimer d'un coup. On télécharge alors niveau par niveau.
 */
const MAX_CLASSES = 15;

type Sp = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean);

export default async function PrintBulletinsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Sp> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'reports.print');
  requireFeature(ctx, 'bulletins');
  const base = `/e/${slug}/bulletins/imprimer`;

  if (!ctx.academicYear) {
    return <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />;
  }
  const yearId = ctx.academicYear.id;
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  const periods = await listPeriods(ctx, yearId);
  const period = periods.find((p) => p.id === periodId) ?? null;
  const chosen = list(sp.class);
  const level = typeof sp.niveau === 'string' ? sp.niveau : '';
  const retourListe = `/e/${slug}/bulletins${chosen.length === 1 && periodId ? `?class=${chosen[0]}&period=${periodId}` : ''}`;

  const classes = period ? await listClassesForBulletinPrint(ctx, yearId, period.id) : [];
  // « Tout le niveau » : les classes de ce niveau qui ont des bulletins.
  const classIds = level ? classes.filter((c) => c.level === level && c.bulletins > 0).map((c) => c.id) : chosen;

  // --- Choix : période, puis classes ---------------------------------------
  if (!period || classIds.length === 0 || classIds.length > MAX_CLASSES) {
    const byLevel = new Map<string, typeof classes>();
    for (const c of classes) byLevel.set(c.level, [...(byLevel.get(c.level) ?? []), c]);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Bulletins à imprimer"
          description={`Une ou plusieurs classes, un bulletin par page A4. Jusqu’à ${MAX_CLASSES} classes par téléchargement.`}
          action={
            <Link href={`/e/${slug}/bulletins`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
              Retour
            </Link>
          }
        />
        {classIds.length > MAX_CLASSES ? (
          <Alert tone="warning">
            {classIds.length} classes cochées : c’est trop pour un seul téléchargement. Cochez-en {MAX_CLASSES} au plus, ou
            téléchargez niveau par niveau.
          </Alert>
        ) : null}
        <Card>
          <CardContent>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="period" className="mb-1 block text-sm font-medium">Période</label>
                <select id="period" name="period" defaultValue={period?.id ?? ''} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm">
                  <option value="">—</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Afficher les classes
              </Button>
            </form>
          </CardContent>
        </Card>

        {period ? (
          <form method="get" className="space-y-4">
            <input type="hidden" name="period" value={period.id} />
            <Card>
              <CardContent className="space-y-4">
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {period.name} : cochez les classes. Une classe sans bulletin ne peut pas être cochée (générez d’abord ses bulletins).
                </p>
                {[...byLevel.entries()].map(([lvl, cls]) => {
                  const ready = cls.filter((c) => c.bulletins > 0).length;
                  return (
                    <fieldset key={lvl}>
                      <div className="mb-1 flex flex-wrap items-center gap-3">
                        <legend className="text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">{lvl}</legend>
                        {ready > 0 && ready <= MAX_CLASSES ? (
                          <Button type="submit" name="niveau" value={lvl} variant="ghost" size="sm">
                            Tout le niveau ({ready} classe{ready > 1 ? 's' : ''})
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {cls.map((c) => (
                          <label
                            key={c.id}
                            className={`inline-flex items-center gap-1.5 text-sm ${c.bulletins === 0 ? 'text-[color:var(--muted-foreground)]' : ''}`}
                          >
                            <input type="checkbox" name="class" value={c.id} disabled={c.bulletins === 0} defaultChecked={chosen.includes(c.id)} />
                            {c.name}
                            <span className="text-xs text-[color:var(--muted-foreground)]">({c.bulletins})</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button type="submit">Préparer les bulletins cochés</Button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  // --- Les bulletins, classe après classe ----------------------------------
  const order = new Map(classes.map((c, i) => [c.id, i]));
  const ids = [...classIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const [parClasse, rendu] = await Promise.all([Promise.all(ids.map((id) => listBulletinsForPrint(ctx, id, period.id))), bulletinRender(ctx)]);
  const bulletins = parClasse.flat();

  if (bulletins.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="Aucun bulletin" hint="Générez d’abord les bulletins de ces classes pour cette période." />
        <Link href={base}>
          <Button variant="ghost">Retour</Button>
        </Link>
      </div>
    );
  }

  const noms = parClasse.filter((b) => b.length > 0).map((b) => b[0]!.klass);
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{bulletins.length} bulletin(s)</strong> — {noms.length > 3 ? `${noms.length} classes` : noms.join(', ')} · {period.name}.
          <br />
          <span className="text-[color:var(--muted-foreground)]">
            Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ». Un bulletin par page.
          </span>
        </p>
        <div className="flex gap-2">
          <PrintButton />
          <Link href={chosen.length === 1 && !level ? retourListe : `${base}?period=${period.id}`}>
            <Button variant="ghost">{chosen.length === 1 && !level ? 'Retour' : 'Changer la sélection'}</Button>
          </Link>
        </div>
      </div>

      {bulletins.map((b, i) => (
        <div key={b.id} style={{ breakAfter: i < bulletins.length - 1 ? 'page' : 'auto' }}>
          <BulletinView b={b} {...rendu} />
        </div>
      ))}
    </div>
  );
}
