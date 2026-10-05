import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { readChecklist } from '@/features/onboarding/checklist';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Mise en route' };
export const dynamic = 'force-dynamic';

/**
 * Mise en route : par ou commencer.
 *
 * Une ecole neuve tombe sur des ecrans qui se bloquent les uns les autres —
 * pas d'annee, donc pas de classes ; pas de niveaux, donc pas de classes non
 * plus. Chacun le dit a sa facon, aucun ne dit par ou commencer.
 *
 * Volontairement LEGER : une liste, pas un parcours oblige. On la quitte, on y
 * revient, et elle disparait d'elle-meme quand tout est pret.
 */
export default async function StartupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['settings.update', 'academic_years.manage', 'classes.view']);

  const { steps, done, total, ready } = await readChecklist(ctx);
  const restant = steps.filter((s) => !s.done);
  const prochaine = restant.find((s) => s.blocking) ?? restant[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Mise en route"
        description="Huit points, dans l’ordre. Vous pouvez partir et revenir : rien ne se perd."
        action={
          <Link href={`/e/${slug}/dashboard`}>
            <Button variant="ghost">Tableau de bord</Button>
          </Link>
        }
      />

      {ready ? (
        <Alert tone="success">
          Tout est en place. Cet écran ne vous sera plus proposé&nbsp;; il reste accessible si vous voulez le relire.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              {done} sur {total}
            </p>
            {prochaine ? (
              <span className="text-sm text-[color:var(--muted-foreground)]">
                À suivre&nbsp;: {prochaine.label.toLowerCase()}
              </span>
            ) : null}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface)' }} role="presentation">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round((done / total) * 100)}%`, backgroundColor: 'var(--color-success)' }}
            />
          </div>
        </CardContent>
      </Card>

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
                    style={
                      s.done
                        ? { backgroundColor: 'var(--color-success)', color: '#fff' }
                        : { border: '1.5px solid var(--border)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {s.label}
                      {!s.done && s.blocking ? (
                        <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--color-warning)', border: '1px solid var(--color-warning)' }}>
                          indispensable
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-[color:var(--muted-foreground)]">{s.why}</span>
                  </span>
                </div>
                <Link href={s.href}>
                  <Button variant={s.done ? 'ghost' : s.blocking ? 'primary' : 'secondary'} size="sm">
                    {s.done ? 'Revoir' : s.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
