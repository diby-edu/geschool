import { dashHref, type WatchRange } from '../params';
import type { StaffDashboard } from '../staff';
import type { StaffOverview } from '../types';
import { Card, Seg, pct1 } from './ui';

type Sp = Record<string, string | string[] | undefined>;

/** Courbe lissée (Catmull-Rom → Bézier) à travers des points ; un seul point = rien à relier. */
function smooth(p: [number, number][]): string {
  if (p.length < 2) return '';
  let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Assiduité des 6 dernières semaines. Une semaine sans appel est un TROU dans la courbe, jamais un faux 0 %. */
export function AssiduityCard({ weekly }: { weekly: StaffOverview['weekly'] }) {
  if (!weekly) {
    return (
      <Card>
        <h2 className="text-lg font-extrabold">Assiduité · 6 dernières semaines</h2>
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">L’assiduité apparaît dès les premiers appels enregistrés.</p>
      </Card>
    );
  }
  const known = weekly.series.filter((s): s is { label: string; value: number } => s.value !== null).map((s) => s.value);
  const lo = Math.max(0, Math.floor(Math.min(...known) / 2) * 2 - 2);
  const hi = Math.min(100, Math.ceil(Math.max(...known) / 2) * 2 + 2);
  const x0 = 64;
  const x1 = 650;
  const yTop = 24;
  const yBot = 200;
  const y = (v: number) => yBot - ((v - lo) / (hi - lo || 1)) * (yBot - yTop);
  const x = (i: number) => x0 + (i * (x1 - x0)) / (weekly.series.length - 1);

  // Segments de semaines consécutives : la courbe s'interrompt au trou.
  const runs: { i: number; v: number }[][] = [];
  weekly.series.forEach((s, i) => {
    if (s.value === null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1]!.i === i - 1) last.push({ i, v: s.value });
    else runs.push([{ i, v: s.value }]);
  });
  const ticks = [0, 1, 2, 3].map((k) => lo + (k * (hi - lo)) / 3);
  const delta = weekly.rate7d - weekly.ratePrev7d;
  const last = runs[runs.length - 1]![runs[runs.length - 1]!.length - 1]!;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Assiduité · 6 dernières semaines</h2>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold"
          style={{
            backgroundColor: delta >= 0 ? 'color-mix(in oklch, var(--color-success) 16%, var(--surface))' : 'color-mix(in oklch, var(--color-danger) 14%, var(--surface))',
            color: delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {delta >= 0 ? '▲ +' : '▼ '}
          {pct1(delta)} pt
        </span>
      </div>
      <svg viewBox="0 0 690 250" className="mt-2 h-auto w-full" role="img" aria-label={`Assiduité des 6 dernières semaines : ${weekly.rate7d} % cette semaine`}>
        <defs>
          <linearGradient id="assiduity-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-success)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-success)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1="54" x2="670" y1={y(t)} y2={y(t)} style={{ stroke: 'var(--border)' }} />
            <text x="46" y={y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--muted-foreground)' }}>{Math.round(t)} %</text>
          </g>
        ))}
        {runs.map((run, k) => {
          const pts = run.map((r) => [x(r.i), y(r.v)] as [number, number]);
          const line = smooth(pts);
          return (
            <g key={k}>
              {pts.length > 1 ? <path d={`${line} L${pts[pts.length - 1]![0]} ${yBot} L${pts[0]![0]} ${yBot} Z`} fill="url(#assiduity-area)" /> : null}
              {pts.length > 1 ? <path d={line} fill="none" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: 'var(--color-success)' }} /> : null}
            </g>
          );
        })}
        {weekly.series.map((s, i) => (
          <g key={s.label}>
            {s.value !== null ? <circle cx={x(i)} cy={y(s.value)} r={i === last.i ? 7 : 5} strokeWidth="3" style={{ fill: 'var(--surface)', stroke: 'var(--color-success)' }} /> : null}
            <text x={x(i)} y="240" textAnchor="middle" fontSize="11" style={{ fill: 'var(--muted-foreground)' }}>{s.label}</text>
          </g>
        ))}
        <rect x={x(last.i) - 72} y={y(last.v) - 42} width="64" height="26" rx="13" style={{ fill: 'var(--color-success)' }} />
        <text x={x(last.i) - 40} y={y(last.v) - 24} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{pct1(last.v)} %</text>
      </svg>
    </Card>
  );
}

const LEVEL_COLORS = ['#4a44e0', '#8b5cf6', '#12a99b', '#16a06a', '#f2a71b', '#f97316', '#ec4899'];

export function LevelsCard({ levels }: { levels: NonNullable<StaffOverview['levelDistribution']> }) {
  const max = Math.max(1, ...levels.map((l) => l.value));
  return (
    <Card>
      <h2 className="text-lg font-extrabold">Élèves par niveau</h2>
      {levels.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Aucune classe avec des élèves inscrits.</p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {levels.map((l, i) => (
            <li key={l.label} className="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-3 text-[13px]">
              <span className="truncate font-semibold">{l.label}</span>
              <div className="h-3.5 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 8%, var(--surface))' }}>
                <div className="h-full rounded-full" style={{ width: `${(l.value / max) * 100}%`, backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
              </div>
              <span className="text-right font-semibold tabular-nums">{l.value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const WATCH_LABELS: Record<WatchRange, string> = { w7: '7 jours', m: 'Mois', t: 'Trimestre', y: 'Année scolaire' };

export function WatchCard({ watch, base, sp }: { watch: NonNullable<StaffDashboard['watch']>; base: string; sp: Sp }) {
  return (
    <Card>
      <h2 className="text-lg font-extrabold">Classes à surveiller</h2>
      <p className="mb-3 mt-0.5 text-xs text-[color:var(--muted-foreground)]">Assiduité cumulée, des classes les plus basses aux plus hautes</p>
      <Seg
        label="Période"
        items={(['w7', 'm', 't', 'y'] as const).map((k) => ({ key: k, label: WATCH_LABELS[k], href: dashHref(base, sp, { watch: k === 'w7' ? null : k }), active: watch.range === k, disabled: !watch.available[k] }))}
      />
      <p className="mt-1.5 text-[11px] text-[color:var(--muted-foreground)]">Trimestre : la période en cours (semestre si l’école fonctionne en semestres).</p>
      {watch.rows.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">Aucun appel enregistré sur cette période.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {watch.rows.map((c) => {
            const color = c.rate < 90 ? 'var(--color-danger)' : c.rate < 93 ? 'var(--color-warning)' : 'var(--color-success)';
            return (
              <li key={c.class_id} className="grid grid-cols-[4rem_1fr_4rem] items-center gap-3 text-[13px] sm:grid-cols-[4rem_1fr_4rem_7rem]">
                <span className="truncate font-bold">{c.class_name}</span>
                <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 8%, var(--surface))' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, ((c.rate - 80) / 20) * 100))}%`, backgroundColor: color }} />
                </div>
                <span className="text-right font-extrabold tabular-nums" style={{ color }}>{pct1(Number(c.rate))} %</span>
                <span className="hidden text-right text-[11px] text-[color:var(--muted-foreground)] sm:block">{c.unjustified} abs. non justif.</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
