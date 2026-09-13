import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { getDashboardData } from '@/features/dashboard/queries';
import { Card, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/features/dashboard/components/KpiCard';
import { AttendanceChart } from '@/features/dashboard/components/AttendanceChart';
import { LevelDonut } from '@/features/dashboard/components/LevelDonut';
import { ClassFillList } from '@/features/dashboard/components/ClassFillList';
import { ActivityFeed } from '@/features/dashboard/components/ActivityFeed';
import { TodoPanel } from '@/features/dashboard/components/TodoPanel';

export const metadata: Metadata = { title: 'Tableau de bord' };

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const data = await getDashboardData(ctx);
  const base = `/e/${ctx.school.slug}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          {ctx.school.name}
          {ctx.academicYear ? ` · ${ctx.academicYear.name}` : ''}
          {data.kind === 'staff' && data.periodName ? ` · ${data.periodName}` : ''}
        </p>
      </div>

      {data.kind === 'staff' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.students ? (
              <KpiCard
                label="Eleves inscrits"
                value={data.students.total.toLocaleString('fr-FR')}
                {...(data.students.new30d > 0
                  ? { trend: { direction: 'up' as const, text: `+${data.students.new30d} ce mois-ci` } }
                  : {})}
              />
            ) : null}
            {data.teachers !== null ? (
              <KpiCard label="Enseignants" value={data.teachers.toLocaleString('fr-FR')} />
            ) : null}
            {data.classes !== null ? <KpiCard label="Classes actives" value={data.classes.toLocaleString('fr-FR')} /> : null}
            {data.attendance ? (
              <KpiCard
                label="Presence (7 jours)"
                value={data.attendance.rate7d.toLocaleString('fr-FR')}
                unit="%"
                spark={data.attendance.series.map((s) => s.value).filter((v): v is number => v !== null)}
                trend={{
                  direction:
                    data.attendance.rate7d > data.attendance.ratePrev7d
                      ? 'up'
                      : data.attendance.rate7d < data.attendance.ratePrev7d
                        ? 'down'
                        : 'flat',
                  text: `${(data.attendance.rate7d - data.attendance.ratePrev7d >= 0 ? '+' : '')}${(data.attendance.rate7d - data.attendance.ratePrev7d).toFixed(1)} pt`,
                }}
              />
            ) : null}
            {data.grades ? (
              <KpiCard
                label="Moyenne generale"
                value={data.grades.average !== null ? data.grades.average.toLocaleString('fr-FR') : '—'}
                unit="/20"
                {...(data.grades.average !== null && data.grades.averagePrev !== null
                  ? {
                      trend: {
                        direction: (data.grades.average > data.grades.averagePrev
                          ? 'up'
                          : data.grades.average < data.grades.averagePrev
                            ? 'down'
                            : 'flat') as 'up' | 'down' | 'flat',
                        text: `${data.grades.average - data.grades.averagePrev >= 0 ? '+' : ''}${(data.grades.average - data.grades.averagePrev).toFixed(2)}`,
                      },
                    }
                  : {})}
              />
            ) : null}
            {data.bulletins ? (
              <KpiCard label="Bulletins publies" value={`${data.bulletins.published}/${data.bulletins.total}`} />
            ) : null}
          </div>

          {data.attendance || data.levelDistribution ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
              {data.attendance ? (
                <SectionCard title="Assiduite — 6 dernieres semaines">
                  <AttendanceChart series={data.attendance.series} />
                </SectionCard>
              ) : null}
              {data.levelDistribution && data.levelDistribution.length > 0 ? (
                <SectionCard title="Repartition par niveau">
                  <LevelDonut data={data.levelDistribution} />
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.classFill && data.classFill.length > 0 ? (
              <SectionCard title="Taux de remplissage des classes" action={<Link href={`${base}/classes`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">Toutes les classes</Link>}>
                <ClassFillList classes={data.classFill} />
              </SectionCard>
            ) : null}
            <SectionCard title="A traiter">
              <TodoPanel items={data.todos} />
            </SectionCard>
          </div>

          {data.activity ? (
            <SectionCard title="Activite recente" action={<Link href={`${base}/access`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">Gestion des acces</Link>}>
              <ActivityFeed items={data.activity} />
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {data.kind === 'teacher' ? (
        <>
          {data.unreadNotifications > 0 ? (
            <Card>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm">
                  <strong>{data.unreadNotifications}</strong> notification(s) non lue(s)
                </span>
                <Link href={`${base}/notifications`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                  Consulter
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Mes classes
            </h2>
            {data.classes.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Aucune classe ne vous est encore affectee.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.classes.map((c) => (
                  <li key={c.id}>
                    <Card>
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.name}</span>
                          {c.level ? <span className="text-xs text-[color:var(--muted-foreground)]">{c.level}</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{c.students} eleve(s)</p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {data.kind === 'family' ? (
        <>
          {data.unreadNotifications > 0 ? (
            <Card>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm">
                  <strong>{data.unreadNotifications}</strong> notification(s) non lue(s)
                </span>
                <Link href={`${base}/notifications`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                  Consulter
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              {data.students.length > 1 ? 'Mes enfants' : 'Mon dossier'}
            </h2>
            {data.students.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Aucun dossier accessible pour le moment.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.students.map((s) => (
                  <li key={s.id}>
                    <Card>
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{s.name}</span>
                          <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</span>
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {s.className ?? 'Classe non renseignee'}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <span>
                            Moyenne :{' '}
                            <strong className="tabular-nums">{s.lastAverage !== null ? `${s.lastAverage}/20` : '—'}</strong>
                          </span>
                          <span className={s.absences30d > 0 ? 'text-[color:var(--color-warning)]' : 'text-[color:var(--muted-foreground)]'}>
                            {s.absences30d} absence(s) (30j)
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
