'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthPoint } from '@/features/platform-dashboard/stats';

type Mesure = 'students' | 'schools' | 'revenue';

const MESURES: Record<Mesure, { label: string; couleur: string; cumule: boolean }> = {
  students: { label: 'Élèves inscrits', couleur: 'var(--color-brand)', cumule: true },
  schools: { label: 'Établissements', couleur: 'var(--color-success)', cumule: true },
  revenue: { label: 'Encaissé', couleur: 'var(--color-warning)', cumule: false },
};

/**
 * La courbe des douze derniers mois.
 *
 * Élèves et établissements sont CUMULÉS — ce qui compte est le parc, pas les
 * arrivées du mois. L'encaissé, lui, se lit mois par mois : c'est une recette,
 * pas un stock.
 */
export function GrowthChart({ months }: { months: MonthPoint[] }) {
  const [mesure, setMesure] = useState<Mesure>('students');
  const conf = MESURES[mesure];

  // Cumul sans variable mutable : React interdit de réassigner après le rendu.
  const data = months.reduce<{ label: string; valeur: number }[]>((acc, m) => {
    const precedent = acc.length > 0 ? acc[acc.length - 1]!.valeur : 0;
    acc.push({ label: m.label, valeur: conf.cumule ? precedent + m[mesure] : m[mesure] });
    return acc;
  }, []);

  const vide = data.every((d) => d.valeur === 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MESURES) as Mesure[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMesure(m)}
            className="rounded-xl border px-3 py-1 text-sm"
            style={
              mesure === m
                ? { backgroundColor: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
                : { backgroundColor: 'var(--surface)' }
            }
          >
            {MESURES[m].label}
          </button>
        ))}
      </div>

      {vide ? (
        <p className="rounded-xl border p-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--surface)' }}>
          Rien à tracer sur cette période.
        </p>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={conf.couleur} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={conf.couleur} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                formatter={(v) => [Number(v ?? 0).toLocaleString('fr-FR'), conf.label]}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="valeur" stroke={conf.couleur} strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-[color:var(--muted-foreground)]">
        {conf.cumule ? 'Total cumulé à la fin de chaque mois.' : 'Montant encaissé dans le mois.'}
      </p>
    </div>
  );
}
