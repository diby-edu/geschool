'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Degrade autour de la couleur de marque : suffisant pour distinguer quelques
// niveaux sans introduire une palette categorique arbitraire.
const COLORS = ['var(--color-brand)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--muted-foreground)'];

export function LevelDonut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={40} outerRadius={62} startAngle={90} endAngle={-270} stroke="var(--surface)" strokeWidth={2}>
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={COLORS[i % COLORS.length] ?? 'var(--color-brand)'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">{total}</span>
          <span className="text-[10px] text-[color:var(--muted-foreground)]">eleves</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
