import Link from 'next/link';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { dashHref, type TopRange } from '../params';
import type { StaffDashboard } from '../staff';
import { BlocHead, Card, Pill, Ring, SecLabel, Seg, Sub, Tile, fr, pct, pct1, plural } from './ui';

type Sp = Record<string, string | string[] | undefined>;

const TOP_LABELS: Record<TopRange, string> = { d: 'Jour', w: 'Semaine', m: 'Mois' };

export function hhmm(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00Z`));
}

function Live() {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold" style={{ color: 'var(--color-success)' }}>
      <span className="pulse-dot h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
      En direct
    </span>
  );
}

/** Bloc 1 — Suivi du jour : appels numériques, présence des élèves, Top 5 des enseignants sans appel. */
export function DayBlock({ data, base, sp, timezone }: { data: StaffDashboard; base: string; sp: Sp; timezone: string }) {
  const { day, top, today, nowIso } = data;
  if (!day) return null;
  const at = hhmm(nowIso, timezone);
  const head = (
    <BlocHead
      title="Suivi du jour"
      sub={`${dateFr(today)} · mis à jour à ${at} · les chiffres se mettent à jour à chaque appel · cliquez sur un chiffre pour le détail`}
      right={<Live />}
    />
  );

  if (day.missing) {
    return (
      <section className="space-y-3">
        {head}
        <Alert tone="info">Le suivi du jour nécessite une mise à jour de la base (migration 0055). Demandez à l’administrateur technique de l’appliquer.</Alert>
      </section>
    );
  }
  const o = day.overview;
  if (!o) return null;

  const callsHref = (tab?: string) => dashHref(base, sp, { panel: 'calls', ptab: tab ?? null, tp: null, tid: null });
  const rate = pct(o.done, o.expected);
  const presRate = o.counted > 0 ? ((o.present + o.late) / o.counted) * 100 : null;
  const seg = (n: number) => (o.counted > 0 ? `${((n / o.counted) * 100).toFixed(2)}%` : '0%');
  const legend = (label: string, n: number, color: string, panel: string) => (
    <Link key={panel + label} href={dashHref(base, sp, { panel, tid: null, tp: null, ptab: null })} scroll={false} className="inline-flex items-center gap-1.5 hover:underline">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label} <b className="tabular-nums">{fr(n)}</b>
    </Link>
  );

  return (
    <section className="space-y-3">
      {head}
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.12fr]">
          {/* 1 — Appels numériques */}
          <Sub>
            <SecLabel n="1" module="presences">Appels numériques</SecLabel>
            <div className="grid grid-cols-2 gap-3">
              <Tile
                tone="green"
                label="Appels effectués"
                value={fr(o.done)}
                unit={`/ ${fr(o.expected)}`}
                sub={`séances appelées, sur ${fr(o.expected)} terminées à cette heure`}
                href={callsHref('done')}
                min={170}
              />
              <Link
                href={callsHref('done')}
                scroll={false}
                className="flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-[1.25rem] p-4 text-white transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
                style={{ background: 'linear-gradient(135deg, #065f46, #0a7d55)', minHeight: 170 }}
              >
                <span className="flex items-center justify-between text-xs font-bold">
                  Taux d’appel numérique <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="flex justify-center">
                  <Ring percent={rate} label={rate === null ? '—' : `${rate} %`} />
                </span>
                <span className="text-center text-xs font-medium">{o.expected > 0 ? `${o.done} ÷ ${o.expected} × 100` : 'Aucune séance terminée'}</span>
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link href={callsHref('missed')} scroll={false}><Pill tone={o.missed > 0 ? 'bad' : 'good'}>{o.missed} non {plural(o.missed, 'fait', 'faits')}</Pill></Link>
              <Link href={callsHref('now')} scroll={false}><Pill tone="info">{o.ongoing} en cours</Pill></Link>
              <Link href={callsHref('next')} scroll={false}><Pill tone="muted">{o.upcoming} à venir</Pill></Link>
            </div>
            <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
              Le total ({o.expected}) est celui de cet instant : les séances dont le créneau est terminé. Il augmente à chaque fin de créneau.
            </p>
          </Sub>

          {/* 2 — Présence des élèves */}
          <Sub>
            <SecLabel n="2" module="presences">Présence des élèves</SecLabel>
            <div className="grid grid-cols-2 gap-3">
              <Tile tone="green" label="Présents" value={fr(o.present)} unit={`/ ${fr(o.counted)}`} sub="élèves comptés à cette heure" href={dashHref(base, sp, { panel: 'pres', tid: null, tp: null, ptab: null })} min={104} size={32} />
              <Tile tone="rose" label="Absents" value={fr(o.absent)} sub={`dont ${fr(o.justified)} ${plural(o.justified, 'justifié', 'justifiés')}`} href={dashHref(base, sp, { panel: 'abs', tid: null, tp: null, ptab: null })} min={104} size={38} />
              <Tile tone="amber" label="Retards" value={fr(o.late)} sub="retards enregistrés" href={dashHref(base, sp, { panel: 'ret', tid: null, tp: null, ptab: null })} min={104} size={38} />
              <Tile tone="indigo" label="Taux de présence" value={presRate === null ? '—' : pct1(presRate)} unit={presRate === null ? undefined : '%'} sub={o.counted > 0 ? `présents + retards, sur ${fr(o.counted)} comptés` : 'aucun appel terminé'} href={dashHref(base, sp, { panel: 'pres', tid: null, tp: null, ptab: null })} min={104} size={38} />
            </div>
            {o.counted > 0 ? (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Répartition des ${o.counted} élèves comptés : ${o.present} présents, ${o.late} retards, ${o.absent} absents`}>
                  <span style={{ width: seg(o.present), backgroundColor: '#34d399' }} />
                  <span style={{ width: seg(o.late), backgroundColor: '#fbbf24', minWidth: o.late > 0 ? 6 : 0 }} />
                  <span style={{ width: seg(o.absent), backgroundColor: '#fb7185', minWidth: o.absent > 0 ? 6 : 0 }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {legend('Présents', o.present, '#34d399', 'pres')}
                  {legend('Retards', o.late, '#fbbf24', 'ret')}
                  {legend('Absents', o.absent, '#fb7185', 'abs')}
                </div>
              </>
            ) : null}
            {o.nocall_students > 0 ? (
              <Link
                href={dashHref(base, sp, { panel: 'noc', tid: null, tp: null, ptab: null })}
                scroll={false}
                className="flex items-center gap-2.5 rounded-2xl border p-3 transition-colors hover:brightness-95"
                style={{ backgroundColor: 'color-mix(in oklch, var(--color-danger) 12%, var(--surface))', borderColor: 'color-mix(in oklch, var(--color-danger) 35%, var(--border))', color: 'color-mix(in oklch, var(--color-danger) 70%, var(--foreground))' }}
              >
                <TriangleAlert className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">
                    {fr(o.nocall_students)} {plural(o.nocall_students, 'élève sans appel', 'élèves sans appel')} <span className="font-semibold">· {o.nocall_classes} {plural(o.nocall_classes, 'classe', 'classes')}</span>
                  </span>
                  <span className="block text-[11px] leading-snug opacity-90">Appel non fait à la fin du créneau : ni présents, ni absents</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </Link>
            ) : null}
            <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
              {o.counted > 0
                ? `${fr(o.present)} + ${fr(o.late)} + ${fr(o.absent)} = ${fr(o.counted)} élèves comptés à cet instant. Le total augmente à chaque appel terminé.`
                : 'Les élèves sont comptés dès qu’un appel est terminé.'}
            </p>
          </Sub>

          {/* 3 — Top 5 des enseignants n'ayant pas effectué l'appel */}
          <Sub>
            <SecLabel n="3" module="presences">Top 5 des enseignants n’ayant pas effectué l’appel</SecLabel>
            {top ? (
              <>
                <Seg
                  label="Période du classement"
                  items={(['d', 'w', 'm'] as const).map((k) => ({ key: k, label: TOP_LABELS[k], href: dashHref(base, sp, { top: k === 'd' ? null : k }), active: top.range === k }))}
                />
                {top.rows.length === 0 ? (
                  <p className="rounded-2xl px-3 py-4 text-sm font-semibold" style={{ backgroundColor: 'color-mix(in oklch, var(--color-success) 14%, var(--surface))', color: 'var(--color-success)' }}>
                    {o.expected === 0 && top.range === 'd' ? 'Aucun créneau terminé pour le moment.' : 'Tous les appels ont été faits sur cette période.'}
                  </p>
                ) : (
                  <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {top.rows.map((t, i) => (
                      <li key={t.teacher_id} className="flex items-center gap-2.5 py-2">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-extrabold"
                          style={{ backgroundColor: ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3'][i], color: i < 3 ? '#fff' : '#7f1035' }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={dashHref(base, sp, { panel: 'teacher', tid: t.teacher_id, tp: null, ptab: null })}
                            scroll={false}
                            className="border-b border-dashed border-current text-[13px] font-bold hover:text-[color:var(--color-brand)]"
                          >
                            {t.teacher_name ?? 'Enseignant'}
                          </Link>
                          <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">
                            {t.subjects ?? '—'} · sur {t.expected} {plural(t.expected, 'attendu', 'attendus')}
                          </p>
                        </div>
                        <Pill tone="bad">{t.missed} {plural(t.missed, 'manqué', 'manqués')}</Pill>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted-foreground)]" aria-hidden />
                      </li>
                    ))}
                  </ol>
                )}
                <p className="text-[11px] text-[color:var(--muted-foreground)]">Appels non faits à la fin du créneau · cliquez sur un nom pour le détail</p>
              </>
            ) : null}
          </Sub>
        </div>
      </Card>
    </section>
  );
}

