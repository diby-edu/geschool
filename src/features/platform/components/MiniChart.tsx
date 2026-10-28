/**
 * Petites courbes de la page Technique (lot C, 0155). Rendues côté serveur, en
 * SVG, sans bibliothèque : une seule série par graphique (le titre la nomme,
 * pas de légende), un seuil en pointillé, et la valeur exacte au survol
 * (une zone de survol par point, plus large que le trait).
 */

export type ChartPoint = { t: string; v: number | null };

const W = 300;
const H = 100;
const PAD = 4;

const hhmm = (iso: string, withDay: boolean) =>
  new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Abidjan',
    ...(withDay ? { day: '2-digit', month: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });

export function MiniLine({
  points,
  format,
  threshold,
  max,
  color = 'var(--color-brand)',
  label,
}: {
  points: ChartPoint[];
  format: (v: number) => string;
  threshold?: { value: number; label: string };
  /** Haut de l'échelle ; sinon, le plus grand point (ou le seuil). */
  max?: number;
  color?: string;
  label: string;
}) {
  const values = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (points.length < 2 || values.length === 0) {
    return <p className="py-6 text-center text-xs text-[color:var(--muted-foreground)]">Pas encore assez de relevés pour tracer la courbe.</p>;
  }
  const top = max ?? (Math.max(...values, threshold?.value ?? 0) * 1.1 || 1);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (Math.min(v, top) / top) * (H - 2 * PAD);
  const withDay = new Date(points[points.length - 1]!.t).getTime() - new Date(points[0]!.t).getTime() > 86_400_000;

  // Un point sans valeur (site sans réponse) coupe la ligne : on ne relie pas à travers un trou.
  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.v === null) {
      if (cur.length) segments.push(cur.join(' '));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(' '));
  const last = values[values.length - 1]!;
  const step = (W - 2 * PAD) / Math.max(1, points.length - 1);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-28 w-full" role="img" aria-label={`${label} : dernière valeur ${format(last)}`}>
        <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {threshold ? (
          <line
            x1={0}
            y1={y(threshold.value)}
            x2={W}
            y2={y(threshold.value)}
            stroke="var(--color-warning)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {segments.map((pts, i) =>
          pts.includes(' ') ? (
            <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null,
        )}
        {points.map((p, i) => (
          <rect key={p.t} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent">
            <title>{`${hhmm(p.t, withDay)} — ${p.v === null ? 'sans réponse' : format(p.v)}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between gap-2 text-[11px] text-[color:var(--muted-foreground)]">
        <span>{hhmm(points[0]!.t, withDay)}</span>
        <span>
          {threshold ? `pointillé : ${threshold.label} · ` : ''}max. {format(Math.max(...values))}
        </span>
        <span>{hhmm(points[points.length - 1]!.t, withDay)}</span>
      </figcaption>
    </figure>
  );
}

/** Barres d'une série par jour (activité des 7 derniers jours). */
export function MiniBars({ days, label, color = 'var(--color-brand)' }: { days: { d: string; v: number }[]; label: string; color?: string }) {
  const top = Math.max(1, ...days.map((d) => d.v));
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
  return (
    <figure className="m-0">
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={`${label} sur 7 jours`}>
        {days.map((d) => (
          <div key={d.d} className="flex h-full flex-1 flex-col justify-end" title={`${day(d.d)} : ${d.v.toLocaleString('fr-FR')}`}>
            <div
              className="w-full rounded-t"
              style={{ height: `${Math.max(d.v > 0 ? 4 : 1, (d.v / top) * 100)}%`, background: d.v > 0 ? color : 'var(--border)' }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex gap-1.5 text-[10px] text-[color:var(--muted-foreground)]">
        {days.map((d) => (
          <span key={d.d} className="flex-1 truncate text-center">
            {day(d.d)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
