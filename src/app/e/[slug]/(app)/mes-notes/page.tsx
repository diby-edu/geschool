import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { myChildren, pickChild } from '@/features/family/children';
import { loadChildNotes } from '@/features/family/notes';
import { formatDate } from '@/features/academic-years/labels';
import { periodScopeLabel } from '@/features/academic-years/periods-by-track';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Mes notes' };
export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Pastille de choix : un enfant, une période. Le choix vit dans l'URL. */
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

/**
 * « Mes notes », espace Parent.
 *
 * Le tableau de bord affichait la dernière moyenne et les quatre dernières
 * notes, sans rien derrière : cette page est ce « derrière ». Par matière,
 * toutes les notes publiées de la période, et la moyenne qui en découle.
 *
 * Aucune permission requise, et c'est voulu : un parent n'en porte aucune
 * (migration 0028). Ce qu'il voit est borné par le lien parent–enfant et par la
 * publication des évaluations, tous deux appliqués par la base (RLS 0021/0029),
 * jamais par cet écran.
 */
export default async function MesNotesPage({
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
  requireFeature(ctx, 'grades');

  const base = `/e/${slug}/mes-notes`;
  const children = await myChildren(ctx);
  const child = pickChild(children, premier(sp.enfant));

  if (!child) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Mes notes" description={ctx.school.name} />
        <EmptyState
          title="Aucun dossier accessible"
          hint="L’établissement doit rattacher votre compte à votre enfant."
        />
      </div>
    );
  }

  const notes = await loadChildNotes(ctx, child, premier(sp.periode));
  const note = (n: number | null) => (n === null ? '—' : n.toFixed(notes.decimals));
  const lien = (p: { enfant?: string; periode?: string }) => {
    const q = new URLSearchParams();
    q.set('enfant', p.enfant ?? child.id);
    if (p.periode) q.set('periode', p.periode);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Mes notes"
        description={`${child.name}${child.className ? ` · ${child.className}` : ''}`}
      />

      {children.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {children.map((c) => (
            <Choix key={c.id} href={lien({ enfant: c.id })} label={c.name} active={c.id === child.id} />
          ))}
        </div>
      ) : null}

      {notes.periods.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {notes.periods.map((p) => (
            <Choix key={p.id} href={lien({ periode: p.id })} label={p.name} active={p.id === notes.period?.id} />
          ))}
        </div>
      ) : null}

      {notes.period === null ? (
        <EmptyState title="Aucune période de notation" hint="L’établissement n’a pas encore découpé l’année." />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-semibold">
                  {notes.period.name}
                  {periodScopeLabel(notes.period.tracks) ? (
                    <span className="font-normal text-[color:var(--muted-foreground)]">
                      {' '}
                      · {periodScopeLabel(notes.period.tracks)}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Calculée sur les notes publiées. Le bulletin, une fois publié, fait foi.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Moyenne générale</p>
                <p className="text-2xl font-bold tabular-nums">
                  {note(notes.periodAverage)}
                  <span className="text-sm font-medium text-[color:var(--muted-foreground)]"> / {notes.scaleMax}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {notes.subjects.length === 0 ? (
            <EmptyState
              title="Aucune note publiée pour cette période"
              hint="Les notes apparaissent ici dès que l’enseignant publie son évaluation."
            />
          ) : (
            <ul className="space-y-3">
              {notes.subjects.map((s) => (
                <li key={s.subjectId}>
                  <Card>
                    <CardContent className="py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="font-bold">{s.subject}</h2>
                        <span className="text-sm">
                          <span className="text-[color:var(--muted-foreground)]">Moyenne </span>
                          <span className="font-bold tabular-nums">{note(s.average)}</span>
                          <span className="text-[color:var(--muted-foreground)]"> / {notes.scaleMax}</span>
                        </span>
                      </div>

                      <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
                        {s.grades.map((g) => (
                          <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{g.title}</span>
                              <span className="block truncate text-xs text-[color:var(--muted-foreground)]">
                                {g.date ? formatDate(g.date) : 'Date non précisée'}
                                {g.coefficient !== 1 ? ` · coefficient ${g.coefficient}` : ''}
                                {g.excluded ? ' · non comptée dans la moyenne' : ''}
                                {g.comment ? ` · ${g.comment}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums">
                              {g.isAbsent ? (
                                <span className="font-medium text-[color:var(--muted-foreground)]">
                                  {g.isExcused ? 'Absent (excusé)' : 'Absent'}
                                </span>
                              ) : (
                                <>
                                  {g.score === null ? '—' : g.score.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                                  <span className="font-medium text-[color:var(--muted-foreground)]"> / {g.max}</span>
                                </>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
