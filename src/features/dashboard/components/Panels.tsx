import Link from 'next/link';
import { employmentLabel } from '@/lib/hr';
import { closeHref, dashHref, type CallsTab } from '../params';
import type { PanelData, StaffDashboard } from '../staff';
import type { DayOverview, DaySession } from '../types';
import type { RangeKey } from '../time';
import { hhmm } from './DayBlock';
import { Drawer, Pill, Seg, fr, plural } from './ui';

type Sp = Record<string, string | string[] | undefined>;

const RULE = { borderColor: 'var(--border)' } as const;
const muted = 'text-[color:var(--muted-foreground)]';

function Stat({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' | 'info' | 'warn' }) {
  const bg = {
    good: 'color-mix(in oklch, var(--color-success) 16%, var(--surface))',
    bad: 'color-mix(in oklch, var(--color-danger) 14%, var(--surface))',
    info: 'var(--color-brand-muted)',
    warn: 'color-mix(in oklch, var(--color-warning) 22%, var(--surface))',
  }[tone];
  const fg = { good: 'var(--color-success)', bad: 'var(--color-danger)', info: 'var(--color-brand)', warn: 'color-mix(in oklch, var(--color-warning) 55%, var(--foreground))' }[tone];
  return (
    <div className="min-w-[7rem] flex-1 rounded-2xl p-3" style={{ backgroundColor: bg, color: fg }}>
      <p className="text-[11px] font-bold">{label}</p>
      <p className="text-2xl font-extrabold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

function More({ n, what }: { n: number; what: string }) {
  return n > 0 ? <p className={`pt-2 text-xs ${muted}`}>+ {fr(n)} autres {what}</p> : null;
}

// ---------------------------------------------------------------------------
// Appels du jour
// ---------------------------------------------------------------------------

const CALL_TABS: { key: CallsTab; label: string; phase: DaySession['phase'] }[] = [
  { key: 'done', label: 'Effectués', phase: 'done' },
  { key: 'missed', label: 'Non faits', phase: 'missed' },
  { key: 'now', label: 'En cours', phase: 'ongoing' },
  { key: 'next', label: 'À venir', phase: 'upcoming' },
];

function SessionRow({ s, tz, base, sp }: { s: DaySession; tz: string; base: string; sp: Sp }) {
  const chip =
    s.phase === 'done' ? (
      <Pill tone="good">appel {s.taken_at ? hhmm(s.taken_at, tz) : 'fait'}</Pill>
    ) : s.phase === 'missed' ? (
      <Pill tone="bad">non fait</Pill>
    ) : s.phase === 'ongoing' ? (
      s.called ? <Pill tone="info">appel fait {s.taken_at ? hhmm(s.taken_at, tz) : ''}</Pill> : <Pill tone="warn">pas encore d’appel</Pill>
    ) : (
      <Pill tone="muted">à venir</Pill>
    );
  return (
    <li className="flex items-center gap-2.5 border-b py-2.5 text-[13px]" style={RULE}>
      <span className={`w-[5.5rem] shrink-0 text-xs tabular-nums ${muted}`}>
        {hhmm(s.starts_at, tz)}–{hhmm(s.ends_at, tz)}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <b>{s.class_name ?? '—'}</b> · {s.subject_name ?? '—'}
        </p>
        <p className={`text-[11px] ${muted}`}>
          {s.teacher_id ? (
            <Link href={dashHref(base, sp, { panel: 'teacher', tid: s.teacher_id, tp: null, ptab: null })} scroll={false} className="border-b border-dashed border-current font-bold hover:text-[color:var(--color-brand)]">
              {s.teacher_name ?? 'Enseignant'}
            </Link>
          ) : (
            (s.teacher_name ?? 'Enseignant non renseigné')
          )}
        </p>
      </div>
      {chip}
    </li>
  );
}

function CallsPanel({ p, day, tab, base, sp, tz, now }: { p: Extract<PanelData, { kind: 'calls' }>; day: DayOverview; tab: CallsTab; base: string; sp: Sp; tz: string; now: string }) {
  const counts: Record<CallsTab, number> = { done: day.done, missed: day.missed, now: day.ongoing, next: day.upcoming };
  const list = p.sessions.filter((s) => s.phase === CALL_TABS.find((t) => t.key === tab)!.phase);
  const shown = list.slice(0, 60);
  const rate = day.expected > 0 ? Math.round((day.done / day.expected) * 100) : null;
  return (
    <Drawer title="Appels numériques du jour" sub={`mis à jour à ${hhmm(now, tz)} · en direct`} closeHref={closeHref(base, sp)}>
      <div className="flex flex-wrap gap-2.5">
        <Stat label="Appels effectués" value={`${fr(day.done)} / ${fr(day.expected)}`} tone="good" />
        <Stat label="Taux d’appel" value={rate === null ? '—' : `${rate} %`} tone="info" />
      </div>
      <p className={`my-3 text-xs ${muted}`}>Total = séances dont le créneau est terminé à {hhmm(now, tz)}. Il augmente à chaque fin de créneau.</p>
      <Seg
        label="Type de séance"
        items={CALL_TABS.map((t) => ({ key: t.key, label: `${t.label} · ${counts[t.key]}`, href: dashHref(base, sp, { panel: 'calls', ptab: t.key === 'done' ? null : t.key }), active: tab === t.key }))}
      />
      {shown.length === 0 ? (
        <p className={`py-6 text-sm ${muted}`}>Aucune séance dans cette catégorie.</p>
      ) : (
        <ul className="mt-2">{shown.map((s) => <SessionRow key={s.occurrence_id} s={s} tz={tz} base={base} sp={sp} />)}</ul>
      )}
      <More n={list.length - shown.length} what="séances" />
      {tab === 'now' ? <p className={`pt-2 text-xs ${muted}`}>Ces séances sont comptées à la fin de leur créneau.</p> : null}
      {tab === 'missed' && day.nocall_students > 0 ? (
        <p className="pt-3 text-xs">
          {fr(day.nocall_students)} élèves concernés —{' '}
          <Link href={dashHref(base, sp, { panel: 'noc', ptab: null })} scroll={false} className="font-bold underline">
            voir la liste
          </Link>
        </p>
      ) : null}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Élèves : présents, retards, absents, sans appel (navigation commune)
// ---------------------------------------------------------------------------

function StudentsNav({ active, day, base, sp }: { active: 'pres' | 'ret' | 'abs' | 'noc'; day: DayOverview; base: string; sp: Sp }) {
  const items: { key: 'pres' | 'ret' | 'abs' | 'noc'; label: string; n: number }[] = [
    { key: 'pres', label: 'Présents', n: day.present },
    { key: 'ret', label: 'Retards', n: day.late },
    { key: 'abs', label: 'Absents', n: day.absent },
    { key: 'noc', label: 'Sans appel', n: day.nocall_students },
  ];
  return (
    <div className="space-y-2">
      <Seg label="Catégorie d’élèves" items={items.map((i) => ({ key: i.key, label: `${i.label} · ${fr(i.n)}`, href: dashHref(base, sp, { panel: i.key, ptab: null }), active: active === i.key }))} />
      <p className={`text-xs ${muted}`}>
        {fr(day.present)} + {fr(day.late)} + {fr(day.absent)} = {fr(day.counted)} élèves comptés à cet instant (hors élèves sans appel)
      </p>
    </div>
  );
}

function StudentsPanel({ p, day, base, sp, tz, now }: { p: Extract<PanelData, { kind: 'abs' | 'ret' }>; day: DayOverview; base: string; sp: Sp; tz: string; now: string }) {
  const abs = p.kind === 'abs';
  return (
    <Drawer
      title={abs ? 'Absents aujourd’hui' : 'Retards aujourd’hui'}
      sub={`${fr(p.total)} ${abs ? plural(p.total, 'absent', 'absents') : plural(p.total, 'retard', 'retards')}${abs ? `, dont ${fr(day.justified)} justifiés` : ''} · mis à jour à ${hhmm(now, tz)}`}
      closeHref={closeHref(base, sp)}
    >
      <StudentsNav active={p.kind} day={day} base={base} sp={sp} />
      {p.students.length === 0 ? (
        <p className={`py-6 text-sm ${muted}`}>Personne pour le moment.</p>
      ) : (
        <ul className="mt-3">
          {p.students.map((s) => (
            <li key={`${s.student_id}${s.class_name}`} className="flex items-center gap-2.5 border-b py-2.5 text-[13px]" style={RULE}>
              <span className="min-w-0 flex-1">
                <b>{s.last_name}</b> {s.first_name}
                <span className={muted}> · {s.class_name}</span>
              </span>
              {abs ? <Pill tone={s.justified ? 'good' : 'bad'}>{s.justified ? 'justifiée' : 'non justifiée'}</Pill> : <Pill tone="warn">+ {s.minutes_late} min</Pill>}
            </li>
          ))}
        </ul>
      )}
      <More n={p.total - p.students.length} what={abs ? 'absents' : 'retards'} />
    </Drawer>
  );
}

function PresencePanel({ p, day, base, sp, tz, now }: { p: Extract<PanelData, { kind: 'pres' }>; day: DayOverview; base: string; sp: Sp; tz: string; now: string }) {
  const rate = day.counted > 0 ? (((day.present + day.late) / day.counted) * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  return (
    <Drawer title="Présents aujourd’hui" sub={`${fr(day.present)} présents sur ${fr(day.counted)} élèves comptés · mis à jour à ${hhmm(now, tz)}`} closeHref={closeHref(base, sp)}>
      <StudentsNav active="pres" day={day} base={base} sp={sp} />
      <h3 className={`mt-4 text-xs font-bold uppercase tracking-wider ${muted}`}>Par classe ({p.classes.length} classes appelées et terminées)</h3>
      {p.classes.length === 0 ? (
        <p className={`py-6 text-sm ${muted}`}>Aucun appel terminé pour le moment.</p>
      ) : (
        <ul className="mt-1">
          {p.classes.map((c) => (
            <li key={c.class_id} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2.5 border-b py-2 text-[13px]" style={RULE}>
              <b>{c.class_name}</b>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 8%, var(--surface))' }}>
                <div className="h-full rounded-full" style={{ width: `${c.counted ? (c.present / c.counted) * 100 : 0}%`, backgroundColor: '#34d399' }} />
              </div>
              <span className="text-right text-xs tabular-nums">{c.present} / {c.counted}</span>
            </li>
          ))}
        </ul>
      )}
      {rate ? <p className={`pt-3 text-xs ${muted}`}>Taux de présence : ({fr(day.present)} + {fr(day.late)}) ÷ {fr(day.counted)} = {rate} %</p> : null}
    </Drawer>
  );
}

function NoCallPanel({ p, day, base, sp, tz, now }: { p: Extract<PanelData, { kind: 'noc' }>; day: DayOverview; base: string; sp: Sp; tz: string; now: string }) {
  const total = p.classes.reduce((n, c) => n + c.uncounted, 0);
  return (
    <Drawer title="Élèves sans appel" sub={`${fr(total)} élèves · ${p.classes.length} classes · mis à jour à ${hhmm(now, tz)}`} closeHref={closeHref(base, sp)}>
      <StudentsNav active="noc" day={day} base={base} sp={sp} />
      <div
        className="mt-3 rounded-2xl border p-3 text-sm leading-relaxed"
        style={{ backgroundColor: 'color-mix(in oklch, var(--color-danger) 10%, var(--surface))', borderColor: 'color-mix(in oklch, var(--color-danger) 30%, var(--border))' }}
      >
        L’appel n’a pas été fait à la fin du créneau. Ces élèves ne sont comptés <b>ni présents, ni absents</b> : on ne sait pas s’ils étaient là. Dès que l’enseignant valide son appel, ils passent dans présents, retards ou absents, et les totaux se mettent à jour en direct.
      </div>
      {p.classes.length === 0 ? (
        <p className={`py-6 text-sm ${muted}`}>Aucune classe sans appel.</p>
      ) : (
        <ul className="mt-3">
          {p.classes.map((c) => (
            <li key={c.class_id} className="border-b py-2.5 text-[13px]" style={RULE}>
              <div className="flex items-center gap-2.5">
                <b className="w-16 shrink-0">{c.class_name}</b>
                <span className="flex-1" />
                <Pill tone="bad">{c.uncounted} {plural(c.uncounted, 'élève', 'élèves')}</Pill>
              </div>
              <ul className={`mt-1 space-y-0.5 text-[11px] ${muted}`}>
                {c.sessions.map((s, i) => (
                  <li key={i}>
                    {hhmm(s.starts_at, tz)}–{hhmm(s.ends_at, tz)} · {s.subject ?? '—'} ·{' '}
                    {s.teacher_id ? (
                      <Link href={dashHref(base, sp, { panel: 'teacher', tid: s.teacher_id, tp: null, ptab: null })} scroll={false} className="border-b border-dashed border-current font-bold hover:text-[color:var(--color-brand)]">
                        {s.teacher ?? 'Enseignant'}
                      </Link>
                    ) : (
                      (s.teacher ?? 'Enseignant non renseigné')
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="pt-3 text-sm font-bold">Total : {fr(total)} élèves · {p.classes.length} classes</p>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Détail d'un enseignant
// ---------------------------------------------------------------------------

const TEACHER_RANGE_LABEL: Record<'d' | 'w' | 'm' | 'y', string> = { d: 'Jour', w: 'Semaine', m: 'Mois', y: 'Année scolaire' };

function TeacherPanel({ p, slug, canOpenFile, base, sp, tz }: { p: Extract<PanelData, { kind: 'teacher' }>; slug: string; canOpenFile: boolean; base: string; sp: Sp; tz: string }) {
  const d = p.detail;
  if (!d) {
    return (
      <Drawer title="Enseignant introuvable" closeHref={closeHref(base, sp)}>
        <p className={`text-sm ${muted}`}>Cet enseignant n’existe pas ou n’est pas dans votre établissement.</p>
      </Drawer>
    );
  }
  const rate = d.expected > 0 ? Math.round((1 - d.missed / d.expected) * 100) : null;
  const initials = (d.name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  const key = (k: RangeKey, label: string) => ({ key: k, label, href: dashHref(base, sp, { panel: 'teacher', tp: k === 'd' ? null : k }), active: p.range === k, disabled: !p.available[k] });
  return (
    <Drawer title={d.name ?? 'Enseignant'} sub={`${d.specialty ?? 'Enseignant'} · ${employmentLabel(d.employment_type)}`} closeHref={closeHref(base, sp)}>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl text-base font-extrabold text-white" style={{ background: 'linear-gradient(135deg, #065f46, #0a7d55)' }}>{initials}</span>
        <div className="min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 3%, var(--surface))' }}>
          {d.phone ? (
            <span>
              Téléphone <b className="ml-1 tabular-nums">{d.phone}</b>
            </span>
          ) : (
            <span className={muted}>Téléphone non renseigné ou non visible</span>
          )}
        </div>
      </div>
      {canOpenFile ? (
        <Link href={`/e/${slug}/teachers/${d.teacher_id}`} className="mt-2 inline-block text-sm font-bold text-[color:var(--color-brand)] hover:underline">
          Ouvrir la fiche enseignant →
        </Link>
      ) : null}
      <div className="mt-4">
        <Seg
          label="Période"
          items={[
            key('d', TEACHER_RANGE_LABEL.d),
            key('w', TEACHER_RANGE_LABEL.w),
            key('m', TEACHER_RANGE_LABEL.m),
            key('t1', p.periodLabels.t1),
            key('t2', p.periodLabels.t2),
            key('t3', p.periodLabels.t3),
            key('y', TEACHER_RANGE_LABEL.y),
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Stat label="Appels manqués" value={fr(d.missed)} tone={d.missed > 0 ? 'bad' : 'good'} />
        <Stat label="Séances attendues" value={fr(d.expected)} tone="info" />
        <Stat label="Taux d’appel" value={rate === null ? '—' : `${rate} %`} tone={rate === null ? 'info' : rate >= 90 ? 'good' : rate >= 80 ? 'warn' : 'bad'} />
      </div>
      <h3 className={`mt-4 text-xs font-bold uppercase tracking-wider ${muted}`}>Séances non appelées</h3>
      {d.rows.length === 0 ? (
        <p className={`py-4 text-sm ${muted}`}>Aucun appel manqué sur cette période.</p>
      ) : (
        <ul className="mt-1">
          {d.rows.slice(0, 12).map((r, i) => (
            <li key={i} className="flex items-center gap-2.5 border-b py-2.5 text-[13px]" style={RULE}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#fb7185' }} />
              <span className="flex-1">
                {new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${r.day}T12:00:00Z`))} · {hhmm(r.starts_at, tz)}–{hhmm(r.ends_at, tz)} · <b>{r.class ?? '—'}</b> · {r.subject ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <More n={d.missed - Math.min(d.rows.length, 12)} what="séances non appelées" />
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

export function DayPanel({ data, base, sp, tz, slug, tab, canOpenTeacherFile }: { data: StaffDashboard; base: string; sp: Sp; tz: string; slug: string; tab: CallsTab; canOpenTeacherFile: boolean }) {
  const p = data.panel;
  const day = data.day?.overview;
  if (!p || !day) return null;
  switch (p.kind) {
    case 'calls':
      return <CallsPanel p={p} day={day} tab={tab} base={base} sp={sp} tz={tz} now={data.nowIso} />;
    case 'pres':
      return <PresencePanel p={p} day={day} base={base} sp={sp} tz={tz} now={data.nowIso} />;
    case 'abs':
    case 'ret':
      return <StudentsPanel p={p} day={day} base={base} sp={sp} tz={tz} now={data.nowIso} />;
    case 'noc':
      return <NoCallPanel p={p} day={day} base={base} sp={sp} tz={tz} now={data.nowIso} />;
    case 'teacher':
      return <TeacherPanel p={p} slug={slug} canOpenFile={canOpenTeacherFile} base={base} sp={sp} tz={tz} />;
  }
}
