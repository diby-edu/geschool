import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { moveOptions } from '@/features/schedule/constraints/moves';
import { moveSessionAction } from '@/features/schedule/actions';

export const metadata: Metadata = { title: 'Déplacer une séance' };

const DAY_LABEL = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/**
 * Déplacer un cours, et savoir pourquoi les autres créneaux ne conviennent pas.
 *
 * C'est la réponse concrète à « pourquoi M. Yao a-t-il un trou le jeudi ? » :
 * chaque créneau libre est essayé contre l'emploi du temps existant, et ce qui
 * le bloque est nommé. Aucune résolution n'est relancée — c'est instantané.
 */
export default async function MoveSessionPage({
  params,
}: {
  params: Promise<{ slug: string; versionId: string; sessionId: string }>;
}) {
  const { slug, versionId, sessionId } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.view');
  const canMove = hasPermission(ctx, 'schedule.update');

  const options = await moveOptions(ctx, versionId, sessionId);
  const byDay = new Map<number, typeof options>();
  for (const o of options) {
    const list = byDay.get(o.slot.dayOfWeek) ?? [];
    list.push(o);
    byDay.set(o.slot.dayOfWeek, list);
  }
  const possible = options.filter((o) => o.ok && !o.current).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Déplacer cette séance"
        description="Chaque créneau est confronté à l’emploi du temps existant et à vos règles."
        action={
          <Link
            href={`/e/${slug}/schedule/${versionId}`}
            className="text-sm text-[color:var(--muted-foreground)] hover:underline"
          >
            Retour
          </Link>
        }
      />

      <Alert tone={possible > 0 ? 'info' : 'error'}>
        {possible > 0
          ? `${possible} créneau(x) possible(s). Les autres sont expliqués ci-dessous.`
          : 'Aucun autre créneau ne convient. Les raisons sont données ci-dessous, créneau par créneau.'}
      </Alert>

      {[...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, slots]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              {DAY_LABEL[day] ?? `Jour ${day}`}
            </h2>
            <ul className="space-y-1.5">
              {slots.map((o) => (
                <li key={o.slot.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium tabular-nums">
                          {o.slot.startsAt}–{o.slot.endsAt}
                          {o.current ? (
                            <span className="ml-2 text-xs font-normal text-[color:var(--muted-foreground)]">
                              créneau actuel
                            </span>
                          ) : null}
                        </p>
                        {o.reasons.length > 0 ? (
                          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                            {o.reasons.join(' · ')}
                          </p>
                        ) : null}
                      </div>

                      {canMove && o.ok && !o.current ? (
                        <SimpleSubmit
                          action={moveSessionAction.bind(null, slug, versionId, sessionId, o.slot.id)}
                          label="Déplacer ici"
                          small
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
