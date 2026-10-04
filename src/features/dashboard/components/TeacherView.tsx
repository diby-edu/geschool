import Link from 'next/link';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { Flash } from '@/components/ui/flash';
import { bannerFor, teacherTiles } from '../sections';
import type { TeacherOverview } from '../types';
import { WelcomeBanner } from './WelcomeBanner';
import { KpiGrid, type KpiTile } from './RoleBlocks';
import { BlocHead, Card, Pill, fr, plural } from './ui';

type Sp = Record<string, string | string[] | undefined>;

const PHASE: Record<'done' | 'missed' | 'ongoing' | 'upcoming', { label: string; tone: 'good' | 'bad' | 'info' | 'muted' }> = {
  done: { label: 'Appel fait', tone: 'good' },
  missed: { label: 'Appel à faire', tone: 'bad' },
  ongoing: { label: 'En cours', tone: 'info' },
  upcoming: { label: 'À venir', tone: 'muted' },
};

/**
 * Tableau de bord de l'espace Enseignant : SA journée (cours du jour, appels à
 * faire), ses notes à arrêter, ses classes. Chaque bloc suit son droit :
 * « emploi du temps » pour la journée, « présences » pour les appels,
 * « évaluations » pour les notes — décoché, le bloc disparaît.
 */
export function TeacherView({ ctx, data, sp }: { ctx: TenantContext; data: TeacherOverview; sp: Sp }) {
  const base = `/e/${ctx.school.slug}`;
  const canAttendance = hasPermission(ctx, 'attendance.view');
  const canAssessments = hasPermission(ctx, 'assessments.view');
  const day = data.day;

  const kpis: KpiTile[] = [];
  if (day) {
    const finished = day.filter((d) => d.phase === 'done' || d.phase === 'missed').length;
    kpis.push({
      key: 'today',
      label: 'Cours aujourd’hui',
      value: fr(day.length),
      sub: day.length === 0 ? 'Aucun cours prévu aujourd’hui' : `${fr(finished)} ${plural(finished, 'terminé', 'terminés')} · ${fr(day.length - finished)} à venir ou en cours`,
      module: 'edt',
      href: `${base}/schedule`,
    });
    if (canAttendance) {
      const missed = day.filter((d) => d.phase === 'missed').length;
      const now = day.filter((d) => d.phase === 'ongoing' && !d.called).length;
      kpis.push({
        key: 'calls',
        label: 'Appels à faire',
        value: fr(missed + now),
        sub: missed > 0 ? `${fr(missed)} ${plural(missed, 'cours terminé', 'cours terminés')} sans appel` : now > 0 ? 'Le cours en cours attend son appel' : 'Tous vos appels sont à jour',
        module: 'presences',
        href: `${base}/attendance`,
        alert: missed > 0,
      });
    }
  }
  if (data.toClose !== null) {
    kpis.push({
      key: 'grades',
      label: 'Notes à arrêter',
      value: fr(data.toClose),
      sub: data.toClose > 0 ? 'Évaluations passées encore ouvertes' : 'Toutes vos notes sont arrêtées',
      module: 'notes',
      href: canAssessments ? `${base}/evaluations` : undefined,
      alert: data.toClose > 0,
    });
  }
  kpis.push({
    key: 'classes',
    label: 'Mes classes',
    value: fr(data.classes.length),
    sub: `${fr(data.stats.studentsCount)} ${plural(data.stats.studentsCount, 'élève', 'élèves')}`,
    module: 'eleves',
    // L'enseignant choisit d'abord SA classe : c'est exactement ce que montre
    // la page Notes & evaluations de son espace.
    href: canAssessments ? `${base}/evaluations` : undefined,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      <h1 className="sr-only">Tableau de bord</h1>
      <WelcomeBanner name={ctx.user.displayName} schoolName={ctx.school.name} {...bannerFor(ctx, data)} />

      {data.unreadNotifications > 0 ? (
        <Card className="flex items-center justify-between py-3">
          <span className="text-sm">
            <strong>{data.unreadNotifications}</strong> notification(s) non lue(s)
          </span>
          <Link href={`${base}/notifications`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
            Consulter
          </Link>
        </Card>
      ) : null}

      <KpiGrid kpis={kpis} title="Ma journée" sub={ctx.academicYear ? `Année ${ctx.academicYear.name}` : 'Aucune année active'} columns={4} />

      {day && day.length > 0 ? (
        <section className="space-y-3">
          <BlocHead title="Mes cours du jour" sub={canAttendance ? 'Touchez un cours pour faire ou revoir son appel' : undefined} />
          <Card>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {day.map((d) => {
                const phase = PHASE[d.phase];
                const content = (
                  <>
                    <span className="w-24 shrink-0 font-mono text-sm tabular-nums">{d.startsAt}–{d.endsAt}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{d.klass}</span>
                      <span className="block truncate text-xs text-[color:var(--muted-foreground)]">{d.subject}</span>
                    </span>
                    <Pill tone={phase.tone}>{phase.label}</Pill>
                  </>
                );
                return (
                  <li key={d.occurrenceId}>
                    {canAttendance && d.phase !== 'upcoming' ? (
                      <Link href={`${base}/attendance/${d.occurrenceId}`} className="flex items-center gap-3 rounded-xl py-2.5 hover:bg-[color:var(--color-brand-muted)]">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 py-2.5">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {teacherTiles(data, base, { attendance: canAttendance, assessments: canAssessments })}

      <section className="space-y-3">
        <BlocHead title="Mes classes" />
        {data.classes.length === 0 ? (
          <Card>
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucune classe ne vous est encore affectée.</p>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.classes.map((c) => {
              const carte = (
                <Card className="h-full py-4 transition hover:border-[color:var(--color-brand)]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{c.name}</span>
                    {c.level ? <span className="text-xs text-[color:var(--muted-foreground)]">{c.level}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{c.students} {plural(c.students, 'élève', 'élèves')}</p>
                </Card>
              );
              return (
                <li key={c.id}>
                  {/* Une classe mene a SES evaluations : sans ce lien, la liste
                      ne servait qu'a regarder. */}
                  {canAssessments ? <Link href={`${base}/evaluations/mine/${c.id}`}>{carte}</Link> : carte}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
