import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { createClient } from '@/lib/supabase/server';
import { myChildren, parentPortal, pickChild } from '@/features/family/children';
import { ParentChrome } from '@/features/family/components/ParentChrome';
import { unreadCount } from '@/features/communication/inbox';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Emploi du temps' };
export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAYS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const hm = (t: string) => {
  const [h, m] = t.split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
};

type Row = {
  schedule_sessions: {
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    subjects: { name: string } | null;
    schedule_versions: { status: string } | null;
    schedule_session_teachers: { teachers: { first_name: string; last_name: string } | null }[];
    schedule_session_rooms: { rooms: { name: string } | null }[];
  } | null;
};

/**
 * Emploi du temps de l'enfant (maquette espace-parent v3, onglet 4) : la
 * semaine type de sa classe, jour par jour, tirée de la version PUBLIÉE. La
 * base ne montre les cours qu'aux parents d'un enfant débloqué (0172).
 */
export default async function ChildSchedulePage({
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

  const [children, portal, unread] = await Promise.all([myChildren(ctx), parentPortal(ctx), unreadCount(ctx)]);
  const child = pickChild(children, premier(sp.enfant));
  const frame = (content: React.ReactNode) => (
    <ParentChrome slug={slug} kids={children} current={child} path="mon-emploi-du-temps" price={portal.price} unread={unread}>
      {content}
    </ParentChrome>
  );

  if (!child) {
    return frame(<EmptyState title="Aucun dossier accessible" hint="L’établissement doit rattacher votre compte à votre enfant." />);
  }
  if (!child.unlocked) return frame(null);

  let rows: Row[] = [];
  if (child.classId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('schedule_session_targets')
      .select(
        'schedule_sessions!inner(day_of_week, starts_at, ends_at, subjects(name), schedule_versions!inner(status), ' +
          'schedule_session_teachers(teachers(first_name, last_name)), schedule_session_rooms(rooms(name)))',
      )
      .eq('school_id', ctx.school.id)
      .eq('class_id', child.classId)
      .eq('schedule_sessions.schedule_versions.status', 'PUBLISHED');
    rows = (data ?? []) as unknown as Row[];
  }
  const lessons = rows
    .map((r) => r.schedule_sessions)
    .filter((s): s is NonNullable<Row['schedule_sessions']> => Boolean(s))
    .sort((a, b) => a.day_of_week - b.day_of_week || a.starts_at.localeCompare(b.starts_at));
  const days = [...new Set(lessons.map((l) => l.day_of_week))];

  const todayIso = new Intl.DateTimeFormat('en-US', { timeZone: ctx.school.timezone, weekday: 'short' }).format(new Date());
  const today = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(todayIso) + 1;
  const wanted = Number(premier(sp.jour));
  const day = days.includes(wanted) ? wanted : days.includes(today) ? today : (days[0] ?? 1);
  const ofDay = lessons.filter((l) => l.day_of_week === day);
  const base = `/e/${slug}/mon-emploi-du-temps?enfant=${child.id}`;

  return frame(
    <>
      <PageHeader title="Emploi du temps" description={`${child.name}${child.className ? ` · ${child.className}` : ''}`} />
      {lessons.length === 0 ? (
        <EmptyState title="Pas encore d’emploi du temps" hint="Il apparaîtra ici dès que l’établissement l’aura publié." />
      ) : (
        <>
          <div className="flex gap-1.5">
            {days.map((d) => (
              <Link
                key={d}
                href={`${base}&jour=${d}`}
                scroll={false}
                aria-current={d === day ? 'page' : undefined}
                className="flex-1 rounded-lg border py-1.5 text-center text-sm font-bold"
                style={d === day ? { background: 'var(--foreground)', color: 'var(--background)', borderColor: 'var(--foreground)' } : { borderColor: 'var(--border)' }}
              >
                {DAYS[d]}
              </Link>
            ))}
          </div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">{DAY_NAMES[day]}</h2>
          <ul className="divide-y rounded-[--radius-card] border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            {ofDay.map((l, i) => {
              const prof = l.schedule_session_teachers.map((t) => t.teachers).filter(Boolean)[0];
              const room = l.schedule_session_rooms.map((r) => r.rooms?.name).filter(Boolean)[0];
              return (
                <li key={i} className="flex gap-3 px-4 py-3 text-sm">
                  <b className="w-28 shrink-0 tabular-nums">
                    {hm(l.starts_at)} – {hm(l.ends_at)}
                  </b>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{l.subjects?.name ?? 'Cours'}</span>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">
                      {[room, prof ? `${prof.last_name.toUpperCase()} ${prof.first_name}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>,
  );
}
