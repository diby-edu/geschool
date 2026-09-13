'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function AttendanceChart({ series }: { series: { label: string; value: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis
          domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin - 5)), 100]}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={34}
        />
        <Tooltip
          formatter={(value) => (value === null || value === undefined ? ['Aucun appel enregistre', 'Presence'] : [`${value}%`, 'Presence'])}
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Area type="monotone" dataKey="value" stroke="var(--color-brand)" strokeWidth={2.5} fill="url(#attendanceFill)" connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
