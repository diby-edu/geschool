import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDate } from '@/features/academic-years/labels';
import type { JustificationRow } from '@/features/attendance/justifications';
import type { AbsentStudent, AnnouncementItem, AssessmentActivity, ClassAverage, KpiValue, QueuedDelivery, RecentEnrollment } from '../role-data';
import { BlocHead, Card, Pill, SecLabel, Tile, fr, plural } from './ui';

/**
 * Blocs des tableaux de bord PAR FONCTION (RoleView). Même habit que le tableau
 * du fondateur : tuiles colorées par module, cartes arrondies, pastilles.
 */

/** Tuile d'indicateur : celles des fonctions (KpiValue) ou de l'espace Enseignant. */
export type KpiTile = Omit<KpiValue, 'key'> & { key: string };

/** Indicateurs de la fonction : une tuile par chiffre, cliquable quand elle mène à la page concernée. */
export function KpiGrid({ kpis, title, sub, columns = 5 }: { kpis: KpiTile[]; title: string; sub: string; columns?: 4 | 5 }) {
  if (kpis.length === 0) return null;
  return (
    <section className="space-y-3">
      <BlocHead title={title} sub={sub} />
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3 xl:grid-cols-5'}`}>
        {kpis.map((k) => (
          <Tile
            key={k.key}
            module={k.module}
            label={k.label}
            value={k.value}
            unit={k.unit}
            href={k.href}
            min={148}
            size={k.value.length > 6 ? 26 : 40}
            sub={k.sub}
            extra={k.alert ? <span><Pill>À traiter</Pill></span> : null}
          />
        ))}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl px-3 py-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 4%, var(--surface))' }}>{children}</p>;
}

function More({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[color:var(--color-brand)] hover:underline">
      {children} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

const avg2 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Moyenne générale de chaque classe sur la période en cours (0060). */
export function ClassAveragesCard({ rows, periodName, href }: { rows: ClassAverage[]; periodName: string | null; href: string | undefined }) {
  const graded = rows.filter((r) => r.average !== null);
  return (
    <Card>
      <SecLabel module="notes">Moyennes par classe{periodName ? ` · ${periodName}` : ''}</SecLabel>
      <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">Moyenne générale des élèves notés, coefficients du programme, évaluations arrêtées.</p>
      {graded.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucune note arrêtée sur la période : les moyennes apparaissent dès la clôture des premières évaluations.</Empty>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {[...graded]
            .sort((a, b) => Number(a.average) - Number(b.average))
            .slice(0, 10)
            .map((c) => {
              const v = Number(c.average);
              const color = v < 10 ? 'var(--color-danger)' : v < 12 ? 'var(--color-warning)' : 'var(--color-success)';
              return (
                <li key={c.class_id} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-[13px] sm:grid-cols-[6rem_1fr_3.5rem_7rem]">
                  <span className="truncate font-bold">{c.class_name}</span>
                  <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 8%, var(--surface))' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, (v / 20) * 100))}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-right font-extrabold tabular-nums" style={{ color }}>{avg2(v)}</span>
                  <span className="hidden text-right text-[11px] text-[color:var(--muted-foreground)] sm:block">
                    {c.below_10 > 0 ? `${c.below_10} sous 10 · ` : ''}
                    {c.graded}/{c.enrolled} {plural(c.enrolled, 'noté', 'notés')}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
      {graded.length > 10 ? <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">Les 10 classes les plus basses sur {graded.length}.</p> : null}
      <More href={href}>Voir les moyennes et classements</More>
    </Card>
  );
}

/** Évaluations de la période, par enseignant (0060). */
export function AssessmentActivityCard({ activity, periodName, href }: { activity: AssessmentActivity; periodName: string | null; href: string | undefined }) {
  return (
    <Card>
      <SecLabel module="notes">Évaluations par enseignant{periodName ? ` · ${periodName}` : ''}</SecLabel>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill tone="info">{fr(activity.total)} {plural(activity.total, 'évaluation', 'évaluations')}</Pill>
        <Pill tone={activity.to_close > 0 ? 'warn' : 'good'}>{fr(activity.to_close)} à arrêter</Pill>
        <Pill tone={activity.late > 0 ? 'bad' : 'good'}>{fr(activity.late)} en retard</Pill>
        <Pill tone={activity.teachers_without > 0 ? 'warn' : 'good'}>{fr(activity.teachers_without)} {plural(activity.teachers_without, 'enseignant', 'enseignants')} sans évaluation</Pill>
      </div>
      {activity.teachers.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucun enseignant affecté sur l’année.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {activity.teachers.map((t) => (
            <li key={t.teacher_id} className="flex items-center gap-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{t.name ?? 'Enseignant'}</p>
                <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">
                  {t.total === 0 ? 'Aucune évaluation sur la période' : `${t.total} ${plural(t.total, 'évaluation', 'évaluations')}${t.last_date ? ` · dernière le ${formatDate(t.last_date)}` : ''}`}
                </p>
              </div>
              {t.late > 0 ? <Pill tone="bad">{t.late} en retard</Pill> : t.to_close > 0 ? <Pill tone="warn">{t.to_close} à arrêter</Pill> : t.total === 0 ? <Pill tone="warn">Aucune</Pill> : <Pill tone="good">À jour</Pill>}
            </li>
          ))}
        </ul>
      )}
      <More href={href}>Ouvrir les évaluations</More>
    </Card>
  );
}

/** Élèves les plus absents sur 30 jours (0060). */
export function AbsenteesCard({ rows, href }: { rows: AbsentStudent[]; href: string | undefined }) {
  return (
    <Card>
      <SecLabel module="presences">Élèves les plus absents · 30 jours</SecLabel>
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucune absence enregistrée ces 30 derniers jours.</Empty>
        </div>
      ) : (
        <ol className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((s, i) => (
            <li key={s.student_id} className="flex items-center gap-2.5 py-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-extrabold" style={{ backgroundColor: 'color-mix(in oklch, var(--color-danger) 14%, var(--surface))', color: 'var(--color-danger)' }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{s.last_name.toUpperCase()} {s.first_name}</p>
                <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">
                  {s.class_name ?? '—'}
                  {s.lates > 0 ? ` · ${s.lates} ${plural(s.lates, 'retard', 'retards')}` : ''}
                </p>
              </div>
              <Pill tone="bad">{s.absences} {plural(s.absences, 'absence', 'absences')}</Pill>
              {s.unjustified > 0 ? <Pill tone="warn">{s.unjustified} non justif.</Pill> : <Pill tone="good">justifiées</Pill>}
            </li>
          ))}
        </ol>
      )}
      <More href={href}>Voir toutes les absences</More>
    </Card>
  );
}

export function JustificationsCard({ rows, href }: { rows: JustificationRow[]; href: string | undefined }) {
  return (
    <Card>
      <SecLabel module="presences">Justificatifs en attente</SecLabel>
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucun justificatif en attente.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((j) => (
            <li key={j.id} className="py-2">
              <p className="truncate text-[13px] font-bold">{j.student}</p>
              <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">
                {j.covers_from === j.covers_to ? `Le ${formatDate(j.covers_from)}` : `Du ${formatDate(j.covers_from)} au ${formatDate(j.covers_to)}`} · {j.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
      <More href={href}>Traiter les justificatifs</More>
    </Card>
  );
}

export function EnrollmentsCard({ rows, base, canOpen }: { rows: RecentEnrollment[]; base: string; canOpen: boolean }) {
  return (
    <Card>
      <SecLabel module="eleves">Dernières inscriptions</SecLabel>
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucune inscription cette année.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((e) => (
            <li key={e.student_id} className="flex items-center gap-2.5 py-2">
              <div className="min-w-0 flex-1">
                {canOpen ? (
                  <Link href={`${base}/students/${e.student_id}`} className="truncate text-[13px] font-bold hover:text-[color:var(--color-brand)]">{e.name}</Link>
                ) : (
                  <p className="truncate text-[13px] font-bold">{e.name}</p>
                )}
                <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">{e.class_name ?? 'Classe non renseignée'}</p>
              </div>
              {e.enrolled_on ? <Pill tone="muted">{formatDate(e.enrolled_on)}</Pill> : null}
            </li>
          ))}
        </ul>
      )}
      <More href={canOpen ? `${base}/students` : undefined}>Voir les élèves</More>
    </Card>
  );
}

const DELIVERY_STATUS: Record<string, string> = { PENDING: 'À envoyer', FAILED: 'Échec' };

export function DeliveriesCard({ rows, base }: { rows: QueuedDelivery[]; base: string }) {
  return (
    <Card>
      <SecLabel module="acces">Identifiants à envoyer ou en échec</SecLabel>
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucun envoi en attente : tous les identifiants sont partis.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{d.name}</p>
                <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">
                  {d.recipient}
                  {d.status === 'FAILED' && d.error ? ` · ${d.error}` : ''}
                </p>
              </div>
              <Pill tone={d.status === 'FAILED' ? 'bad' : 'warn'}>{DELIVERY_STATUS[d.status] ?? d.status}</Pill>
            </li>
          ))}
        </ul>
      )}
      <More href={`${base}/access`}>Ouvrir la gestion des accès</More>
    </Card>
  );
}

const ANNOUNCEMENT_STATUS: Record<string, { label: string; tone: 'good' | 'muted' | 'info' }> = {
  PUBLISHED: { label: 'Publiée', tone: 'good' },
  DRAFT: { label: 'Brouillon', tone: 'info' },
  ARCHIVED: { label: 'Archivée', tone: 'muted' },
};

export function AnnouncementsCard({ rows, base }: { rows: AnnouncementItem[]; base: string }) {
  return (
    <Card>
      <SecLabel module="annonces">Annonces récentes</SecLabel>
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>Aucune annonce pour le moment.</Empty>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map((a) => {
            const st = ANNOUNCEMENT_STATUS[a.status] ?? { label: a.status, tone: 'muted' as const };
            return (
              <li key={a.id} className="flex items-center gap-2.5 py-2">
                <Link href={`${base}/annonces/${a.id}`} className="min-w-0 flex-1 truncate text-[13px] font-bold hover:text-[color:var(--color-brand)]">
                  {a.title}
                </Link>
                {a.at ? <span className="text-[11px] text-[color:var(--muted-foreground)]">{formatDate(a.at.slice(0, 10))}</span> : null}
                <Pill tone={st.tone}>{st.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
      <More href={`${base}/annonces`}>Toutes les annonces</More>
    </Card>
  );
}
