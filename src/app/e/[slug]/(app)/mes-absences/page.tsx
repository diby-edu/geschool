import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { myChildren, parentPortal, pickChild } from '@/features/family/children';
import { ParentChrome } from '@/features/family/components/ParentChrome';
import { unreadCount } from '@/features/communication/inbox';
import { loadChildAttendance } from '@/features/family/attendance';
import { FENETRES, FENETRE_LABEL, parseFenetre } from '@/features/family/attendance-rules';
import { formatDate } from '@/features/academic-years/labels';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Absences' };
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
  const [children, portal, unread] = await Promise.all([myChildren(ctx), parentPortal(ctx), unreadCount(ctx)]);
  const child = pickChild(children, premier(sp.enfant));

  if (!child) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Absences" description={ctx.school.name} />
        <EmptyState
          title="Aucun dossier accessible"
          hint="L’établissement doit rattacher votre compte à votre enfant."
        />
      </div>
    );
  }

  // Enfant non payé : l'écran de paiement, sans rien lire (0172).
  if (!child.unlocked) {
    return (
      <ParentChrome slug={slug} kids={children} current={child} path="mes-absences" price={portal.price} unread={unread}>
        {null}
      </ParentChrome>
    );
  }

  const fenetre = parseFenetre(sp.fenetre);
  const { lines, justifications, since } = await loadChildAttendance(ctx, child, fenetre);
  const absences = lines.filter((l) => l.status !== 'LATE');
  // En heures (appel par heure) : total, justifiées, non justifiées.
  const heures = absences.reduce((n, l) => n + l.hours, 0);
  const justifiees = absences.filter((l) => l.justified).reduce((n, l) => n + l.hours, 0);
  // Plus de retards depuis l'appel par heure (0170) : ceux déjà saisis comptaient l'élève présent.

  const lien = (p: { enfant?: string; fenetre?: string }) => {
    const q = new URLSearchParams();
    q.set('enfant', p.enfant ?? child.id);
    q.set('fenetre', p.fenetre ?? fenetre);
    return `${base}?${q.toString()}`;
  };

  return (
    <ParentChrome slug={slug} kids={children} current={child} path="mes-absences" price={portal.price} unread={unread}>
      <PageHeader title="Absences" description={`${child.name}${child.className ? ` · ${child.className}` : ''}`} />

      <div className="flex flex-wrap items-center gap-2">
        {FENETRES.map((f) => (
          <Choix key={f} href={lien({ fenetre: f })} label={FENETRE_LABEL[f]} active={f === fenetre} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Chiffre label="Total" value={`${heures} h`} hint={`Depuis le ${formatDate(since)}`} />
        <Chiffre label="Justifiées" value={`${justifiees} h`} hint={justifiees > 0 ? 'Avec justificatif accepté' : 'Aucune'} />
        <Chiffre label="Non justifiées" value={`${heures - justifiees} h`} hint={heures - justifiees > 0 ? 'Sans justificatif' : 'Rien à justifier'} />
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
                        {[l.span, l.subject, l.teacher].filter(Boolean).join(' · ')}
                        {l.comment ? ` · ${l.comment}` : ''}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: l.justified ? 'var(--color-success)' : 'var(--color-danger)' }}
                    >
                      {l.hours} h · {l.justified ? 'justifiée' : 'non justifiée'}
                    </span>
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
    </ParentChrome>
  );
}
