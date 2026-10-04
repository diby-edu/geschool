import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { myChildren, pickChild } from '@/features/family/children';
import { loadChildAttendance } from '@/features/family/attendance';
import { FENETRES, FENETRE_LABEL, parseFenetre } from '@/features/family/attendance-rules';
import { formatDate } from '@/features/academic-years/labels';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Absences et retards' };
export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const JUSTIF_LABEL: Record<string, string> = {
  PENDING: 'En attente de décision',
  APPROVED: 'Accepté',
  REJECTED: 'Refusé',
};

function Choix({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`mod-pill inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold${active ? ' mod-pill-active' : ''}`}
    >
      {label}
    </Link>
  );
}

function Chiffre({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-[color:var(--muted-foreground)]">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * « Absences et retards », espace Parent.
 *
 * Le tableau de bord donnait deux nombres sur trente jours, sans le détail :
 * quels jours, quel cours, et surtout — justifiée ou non. C'est cette dernière
 * question qui amène un parent ici, et la page y répond ligne par ligne, en
 * disant aussi ce qu'un justificatif déposé est devenu (accepté, refusé, ou
 * toujours en attente d'une décision de l'établissement).
 *
 * Comme pour les notes : aucune permission, tout est borné par la RLS (0020).
 */
export default async function MesAbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requireFeature(ctx, 'parent_portal');
  requireFeature(ctx, 'attendance');

  const base = `/e/${slug}/mes-absences`;
  const children = await myChildren(ctx);
  const child = pickChild(children, premier(sp.enfant));

  if (!child) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Absences et retards" description={ctx.school.name} />
        <EmptyState
          title="Aucun dossier accessible"
          hint="L’établissement doit rattacher votre compte à votre enfant."
        />
      </div>
    );
  }

  const fenetre = parseFenetre(sp.fenetre);
  const { lines, totals, justifications, since } = await loadChildAttendance(ctx, child, fenetre);
  const absences = lines.filter((l) => l.status !== 'LATE');
  const retards = lines.filter((l) => l.status === 'LATE');

  const lien = (p: { enfant?: string; fenetre?: string }) => {
    const q = new URLSearchParams();
    q.set('enfant', p.enfant ?? child.id);
    q.set('fenetre', p.fenetre ?? fenetre);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Absences et retards"
        description={`${child.name}${child.className ? ` · ${child.className}` : ''}`}
      />

      {children.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {children.map((c) => (
            <Choix key={c.id} href={lien({ enfant: c.id })} label={c.name} active={c.id === child.id} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {FENETRES.map((f) => (
          <Choix key={f} href={lien({ fenetre: f })} label={FENETRE_LABEL[f]} active={f === fenetre} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Chiffre
          label="Absences"
          value={String(totals.absences)}
          hint={`Depuis le ${formatDate(since)}`}
        />
        <Chiffre
          label="Dont justifiées"
          value={String(totals.justifiees)}
          hint={totals.absences > 0 ? `${totals.absences - totals.justifiees} sans justificatif` : 'Rien à justifier'}
        />
        <Chiffre
          label="Retards"
          value={String(totals.retards)}
          {...(totals.minutesLate > 0 ? { hint: `${totals.minutesLate} minutes au total` } : {})}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Absences</h2>
        {absences.length === 0 ? (
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucune absence sur cette période.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-1">
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {absences.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{formatDate(l.date)}</span>
                      <span className="block truncate text-xs text-[color:var(--muted-foreground)]">
                        {l.subject}
                        {l.comment ? ` · ${l.comment}` : ''}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: l.justified ? 'var(--color-success)' : 'var(--color-danger)' }}
                    >
                      {l.justified ? 'Justifiée' : 'Non justifiée'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <section id="retards" className="space-y-3 scroll-mt-24">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Retards</h2>
        {retards.length === 0 ? (
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucun retard sur cette période.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-1">
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {retards.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{formatDate(l.date)}</span>
                      <span className="block truncate text-xs text-[color:var(--muted-foreground)]">
                        {l.subject}
                        {l.comment ? ` · ${l.comment}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{l.minutesLate} min</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {justifications.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Justificatifs déposés
          </h2>
          <Card>
            <CardContent className="py-1">
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {justifications.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {j.from === j.to ? formatDate(j.from) : `${formatDate(j.from)} → ${formatDate(j.to)}`}
                      </span>
                      <span className="block truncate text-xs text-[color:var(--muted-foreground)]">{j.reason}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold">{JUSTIF_LABEL[j.status] ?? j.status}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
