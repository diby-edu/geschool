import Link from 'next/link';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { setGradingOverrideAction } from '@/features/academic-years/actions';
import { formatDate } from '@/features/academic-years/labels';
import { dashHref } from '../params';
import type { StaffDashboard } from '../staff';
import { BlocHead, Card, Meter, Pill, SecLabel, Sub, Tile, fr, pct, plural } from './ui';

type Sp = Record<string, string | string[] | undefined>;

/**
 * Bloc 2 — Moyennes et bulletins. Visible SEULEMENT pendant la période de calcul des
 * moyennes ; la direction l'ouvre / la ferme à tout moment, elle se ferme d'elle-même
 * à la date de fin configurée.
 */
export function GradingBlock({
  data,
  base,
  sp,
  slug,
  yearId,
  canManage,
}: {
  data: StaffDashboard;
  base: string;
  sp: Sp;
  slug: string;
  yearId: string | null;
  canManage: boolean;
}) {
  const g = data.grading?.data;
  if (!g || !g.period.open) return null;
  const { period } = g;

  const window =
    period.grading_ends_on && period.override !== 'OPEN'
      ? `calcul du ${period.grading_starts_on ? formatDate(period.grading_starts_on) : '…'} au ${formatDate(period.grading_ends_on)} · fermeture automatique le ${formatDate(period.grading_ends_on)}`
      : period.override === 'OPEN'
        ? 'ouverte à la main par la direction'
        : 'période de calcul ouverte';

  const right = (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold"
        style={{ backgroundColor: 'color-mix(in oklch, var(--color-success) 16%, var(--surface))', color: 'var(--color-success)' }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
        Période de calcul ouverte
      </span>
      {canManage ? (
        <>
          <SimpleSubmit small action={setGradingOverrideAction.bind(null, slug, period.id, 'CLOSED', 'dashboard')} label="Fermer la période" />
          {yearId ? (
            <Link href={`/e/${slug}/academic-years/${yearId}#calcul-${period.id}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold hover:bg-[color:var(--color-brand-muted)]">
              Dates
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );

  const teacherPct = pct(g.teachers_done, g.teachers_total) ?? 0;
  const bulletinPct = pct(g.bulletins_edited, g.classes_total) ?? 0;
  const list = sp.more === '1' && data.pendingAll ? data.pendingAll.map((r) => ({ id: r.teacher_id, name: r.teacher_name, subjects: r.subjects, remaining: r.remaining })) : g.pending.map((r) => ({ id: r.teacher_id, name: r.name, subjects: r.subjects, remaining: r.remaining }));
  const rest = g.pending_total - g.pending.length;
  const expanded = sp.more === '1' && data.pendingAll !== null;

  return (
    <section className="bloc-moy space-y-3">
      <BlocHead title="Moyennes et bulletins" sub={`${period.name} · ${window}`} right={right} />
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr]">
          <Sub>
            <SecLabel module="notes">Moyennes remplies</SecLabel>
            <Tile
              tone="indigo"
              label="Enseignants ayant terminé"
              value={fr(g.teachers_done)}
              unit={`/ ${fr(g.teachers_total)}`}
              sub="ont marqué leurs moyennes « terminées », par classe et matière"
              min={176}
              size={46}
              extra={
                <>
                  <Meter percent={teacherPct} />
                  <p className="text-[11px] font-medium">{fr(g.assignments_done)} classes-matières sur {fr(g.assignments_total)}</p>
                </>
              }
            />
          </Sub>
          <Sub>
            <SecLabel module="bulletins">Bulletins édités</SecLabel>
            <Tile
              tone="rose"
              label="Classes dont les bulletins sont générés"
              value={fr(g.bulletins_edited)}
              unit={`/ ${fr(g.classes_total)}`}
              sub={
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Pill>{g.bulletins_to_validate} à valider</Pill>
                  <Pill>{g.bulletins_validated} {plural(g.bulletins_validated, 'validé', 'validés')}</Pill>
                  <Pill>{g.bulletins_published} {plural(g.bulletins_published, 'publié', 'publiés')}</Pill>
                </span>
              }
              min={176}
              size={46}
              extra={<Meter percent={bulletinPct} />}
            />
          </Sub>
          <Sub>
            <SecLabel module="notes">Enseignants n’ayant pas encore calculé leur moyenne</SecLabel>
            {list.length === 0 ? (
              <p className="rounded-2xl px-3 py-4 text-sm font-semibold" style={{ backgroundColor: 'color-mix(in oklch, var(--color-success) 14%, var(--surface))', color: 'var(--color-success)' }}>
                Tous les enseignants ont terminé leurs moyennes.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {list.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 py-2">
                    <span className="nav-chip grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[11px] font-extrabold" style={{ '--chip-bg': '#e4e2ff', '--chip-fg': '#3730a3', '--chip-bg-dark': 'rgba(139,133,255,0.18)', '--chip-fg-dark': '#b9b5ff' } as React.CSSProperties}>
                      {(t.name ?? '?').replace(/^(M\.|Mme)\s+/, '').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{t.name ?? 'Enseignant'}</p>
                      <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">{t.subjects ?? '—'}</p>
                    </div>
                    <Pill tone="warn">{t.remaining} {plural(t.remaining, 'classe restante', 'classes restantes')}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {expanded ? (
              <Link href={dashHref(base, sp, { more: null })} scroll={false} className="rounded-xl border border-dashed py-2 text-center text-sm font-bold text-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-muted)]">
                Voir moins
              </Link>
            ) : rest > 0 ? (
              <Link href={dashHref(base, sp, { more: '1' })} scroll={false} className="rounded-xl border border-dashed py-2 text-center text-sm font-bold text-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-muted)]">
                Voir plus ({rest})
              </Link>
            ) : null}
          </Sub>
        </div>
      </Card>
    </section>
  );
}
