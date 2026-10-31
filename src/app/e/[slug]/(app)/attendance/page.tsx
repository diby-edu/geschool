import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listOccurrences } from '@/features/attendance/occurrences';
import { getCurrentCoursesForTeacher } from '@/features/attendance/current';
import { loadAppel } from '@/features/attendance/registers';
import { CurrentAppelCard } from '@/features/attendance/components/CurrentAppelCard';
import { DayClassTable } from '@/features/attendance/components/DayClassTable';
import { loadDayByClass } from '@/features/attendance/day-classes';
import { schoolToday } from '@/features/dashboard/time';
import { ListFilters } from '@/components/data-table/ListFilters';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Appel et présences' };

const REG_LABEL: Record<string, string> = { OPEN: 'En cours', SUBMITTED: 'Soumis', VALIDATED: 'Validé' };

const TODAY_LABEL = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(
  new Date(),
);

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  // « Toutes les présences » inclut l'accès au module.
  requirePageAccessAny(ctx, ['attendance.view', 'attendance.view_all']);
  requireFeature(ctx, 'attendance');
  const base = `/e/${slug}/attendance`;

  // Enseignant sans vision d'ensemble (censeur/surveillant/direction) : le
  // module identifie automatiquement SON cours en ce moment, sans liste ni
  // selection de classe (cahier des charges §3). Le reste du personnel garde
  // la vue par date, inchangee.
  const isPlainTeacher = !hasPermission(ctx, 'attendance.view_all') && (ctx.membership?.roles ?? []).includes('TEACHER');

  if (isPlainTeacher) {
    const courses = await getCurrentCoursesForTeacher(ctx);
    const chosenId = typeof sp.occurrence === 'string' ? sp.occurrence : undefined;
    const chosen = chosenId ? courses.find((c) => c.occurrenceId === chosenId) : courses.length === 1 ? courses[0] : undefined;

    if (courses.length === 0) {
      return (
        <div className="mx-auto max-w-2xl">
          <PageHeader title="Présences" description={TODAY_LABEL} />
          <EmptyState title="Aucun cours actuellement" hint="Le module affichera automatiquement l'appel dès le début de votre prochain cours." />
        </div>
      );
    }

    if (!chosen) {
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <PageHeader title="Plusieurs cours en ce moment" description="Choisissez le cours concerné." />
          <ul className="space-y-2">
            {courses.map((c) => (
              <li key={c.occurrenceId}>
                <Link href={`${base}?occurrence=${c.occurrenceId}`}>
                  <Card>
                    <CardContent className="flex items-center justify-between py-3">
                      <span className="font-medium">{c.klass} — {c.subject}</span>
                      <span className="text-sm text-[color:var(--muted-foreground)]">{c.startsAt}–{c.endsAt}</span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    const appel = await loadAppel(ctx, chosen.occurrenceId);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Présences" />
        <CurrentAppelCard
          slug={slug}
          occurrenceId={chosen.occurrenceId}
          klass={chosen.klass}
          subject={chosen.subject}
          dateLabel={TODAY_LABEL}
          startsAt={chosen.startsIso}
          timeLabel={`${chosen.startsAt}–${chosen.endsAt}`}
          editable={appel.editable}
          students={appel.students}
        />
      </div>
    );
  }

  const now = new Date();
  const today = schoolToday(ctx.school.timezone, now);
  const date = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const canJustify = hasPermission(ctx, 'attendance.justify');
  const canSeeMissing = hasPermission(ctx, 'attendance.missing_calls') || hasPermission(ctx, 'attendance.view_all');
  const headerAction = (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${base}/absences`}><Button variant="ghost">Absences</Button></Link>
      {canSeeMissing ? (
        <Link href={`${base}/non-faits`}><Button variant="ghost">Appels non faits</Button></Link>
      ) : null}
      {canJustify ? <Link href={`${base}/justificatifs`}><Button variant="secondary">Justificatifs</Button></Link> : null}
    </div>
  );

  // Un résumé par classe (0162, maquette validée le 2026-10-30) ; sans la
  // fonction ou sans le droit de tout voir, l'ancienne liste des cours.
  const byClass = await loadDayByClass(ctx, date, now);
  if (byClass) {
    const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
    const niveau = pick(sp.niveau);
    const appels = pick(sp.appels);
    const q = pick(sp.q).trim().toLowerCase();
    const levels = [...new Map(byClass.filter((c) => c.levelId).map((c) => [c.levelId!, c.levelName ?? '—'])).entries()];
    const shown = byClass.filter(
      (c) =>
        (!niveau || c.levelId === niveau) &&
        (!q || c.name.toLowerCase().includes(q)) &&
        (appels !== 'manquant' || c.courses.some((k) => k.state === 'missed')),
    );
    // Les chiffres du haut comptent chaque cours une fois, même commun à deux classes.
    const courses = [...new Map(byClass.flatMap((c) => c.courses.map((k) => [k.id, k] as const))).values()];
    const done = courses.filter((k) => k.ended && k.state === 'done').length;
    const missed = courses.filter((k) => k.state === 'missed').length;
    const ongoing = courses.filter((k) => !k.ended && (k.state === 'now' || k.state === 'done')).length;
    const absent = byClass.reduce((n, c) => n + c.absent, 0);
    const excused = byClass.reduce((n, c) => n + c.excused, 0);
    const late = byClass.reduce((n, c) => n + c.late, 0);
    const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const tile = (value: number, label: React.ReactNode, color?: string) => (
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
        <b className="block text-2xl tabular-nums" style={color ? { color } : undefined}>{value.toLocaleString('fr-FR')}</b>
        <span className="text-xs text-[color:var(--muted-foreground)]">{label}</span>
      </div>
    );

    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title="Appel et présences"
          description={`${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)}${date === today ? '' : ' (autre jour)'} · un résumé par classe, le détail des cours en un clic`}
          action={headerAction}
        />
        {courses.length === 0 ? (
          <EmptyState title="Aucun cours ce jour" hint="Les cours proviennent d’un emploi du temps publié. Choisissez un autre jour ou publiez une version." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
              {tile(done, <>cours terminés <b>avec</b> appel</>, 'var(--color-success)')}
              {tile(missed, <>cours terminés <b>sans</b> appel (le professeur l’a oublié)</>, missed ? 'var(--color-warning)' : undefined)}
              {tile(ongoing, 'cours en ce moment')}
              {tile(absent, `élève${absent > 1 ? 's' : ''} absent${absent > 1 ? 's' : ''}${excused ? `, dont ${excused} avec justificatif` : ''}`, absent ? 'var(--color-danger)' : undefined)}
              {tile(late, `élève${late > 1 ? 's' : ''} arrivé${late > 1 ? 's' : ''} en retard`)}
            </div>
            <ListFilters
              basePath={base}
              fields={[
                { name: 'date', label: 'Jour', allLabel: '', value: date, options: [], type: 'date' },
                { name: 'niveau', label: 'Niveau', allLabel: 'Tous les niveaux', value: niveau, options: levels.map(([id, name]) => ({ value: id, label: name })) },
                {
                  name: 'appels',
                  label: 'Appels',
                  allLabel: 'Toutes les classes',
                  value: appels,
                  options: [{ value: 'manquant', label: 'Avec un appel manquant' }],
                },
              ]}
              search={{ value: pick(sp.q), placeholder: 'Classe (ex. 4e B)…' }}
            />
            <p className="px-1 text-xs text-[color:var(--muted-foreground)]">
              {shown.length} classe{shown.length > 1 ? 's' : ''}
              {shown.length !== byClass.length ? ` sur ${byClass.length}` : ''}
            </p>
            {shown.length === 0 ? (
              <EmptyState title="Aucune classe pour ces filtres" hint="Changez de filtre ou effacez la recherche." />
            ) : (
              <DayClassTable classes={shown} base={base} />
            )}
            <p className="flex flex-wrap gap-4 px-1 text-xs text-[color:var(--muted-foreground)]">
              {[
                ['var(--color-success)', 'appel fait'],
                ['var(--color-warning)', 'terminé sans appel'],
                ['var(--color-brand)', 'en cours'],
                ['var(--border)', 'plus tard'],
              ].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-3 w-3 rounded" style={{ backgroundColor: c }} /> {l}
                </span>
              ))}
              <span>· une pastille double = un cours de 2 h (un seul appel)</span>
            </p>
          </>
        )}
      </div>
    );
  }

  const occurrences = await listOccurrences(ctx, date);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Appel et présences"
        description="Suivre l’appel des cours du jour, fait par chaque enseignant pendant son cours"
        action={headerAction}
      />

      <Card>
        <CardContent>
          <form method="get" className="flex items-end gap-3">
            <div>
              <label htmlFor="date" className="mb-1 block text-sm font-medium">Jour</label>
              <input id="date" name="date" type="date" defaultValue={date} className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm" />
            </div>
            <Button type="submit" variant="secondary" size="sm">Afficher</Button>
          </form>
        </CardContent>
      </Card>

      {occurrences.length === 0 ? (
        <EmptyState
          title="Aucun cours ce jour"
          hint="Les cours proviennent d’un emploi du temps publié. Publiez une version pour générer les séances datées."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Horaire</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Enseignant</th>
                <th className="px-3 py-2">Appel</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {occurrences.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{o.starts_at}–{o.ends_at}</td>
                  <td className="px-3 py-2">{o.klass}</td>
                  <td className="px-3 py-2">{o.subject}</td>
                  <td className="px-3 py-2 text-[color:var(--muted-foreground)]">{o.teacher ?? '—'}</td>
                  <td className="px-3 py-2">{o.register_status ? (REG_LABEL[o.register_status] ?? o.register_status) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`${base}/${o.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
