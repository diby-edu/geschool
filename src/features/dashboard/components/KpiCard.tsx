import { Card } from '@/components/ui/card';

type Trend = { direction: 'up' | 'down' | 'flat'; text: string };

const TREND_COLOR: Record<Trend['direction'], string> = {
  up: 'var(--color-success)',
  down: 'var(--color-danger)',
  flat: 'var(--muted-foreground)',
};
const TREND_ARROW: Record<Trend['direction'], string> = { up: '▲', down: '▼', flat: '·' };

/** Mini-courbe SVG deterministe : pas de dependance client pour si peu. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 88;
  const h = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2] as const);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0" aria-hidden="true">
      <polygon points={area} fill="var(--color-brand)" opacity={0.12} />
      <polyline points={line} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  trend,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  trend?: Trend;
  spark?: number[];
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{value}</span>
          {unit ? <span className="text-sm font-medium text-[color:var(--muted-foreground)]">{unit}</span> : null}
        </div>
        {spark && spark.length >= 2 ? <Sparkline values={spark} /> : null}
      </div>
      {trend ? (
        <span
          className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `color-mix(in oklch, ${TREND_COLOR[trend.direction]} 15%, transparent)`, color: TREND_COLOR[trend.direction] }}
        >
          {TREND_ARROW[trend.direction]} {trend.text}
        </span>
      ) : null}
    </Card>
  );
}
