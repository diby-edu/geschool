export function ClassFillList({ classes }: { classes: { name: string; enrolled: number; capacity: number }[] }) {
  if (classes.length === 0) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Aucune classe active.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {classes.map((c) => {
        // Capacite non renseignee (0) : rien a comparer, on l'affiche pour ce
        // qu'elle est plutot que d'inventer un taux de remplissage.
        if (c.capacity <= 0) {
          return (
            <li key={c.name} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3">
              <span className="truncate text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-[color:var(--muted-foreground)]">Capacite non renseignee</span>
              <span className="text-right text-sm font-semibold tabular-nums">{c.enrolled}</span>
            </li>
          );
        }
        const ratio = c.enrolled / c.capacity;
        const over = c.enrolled > c.capacity;
        const near = !over && ratio >= 0.9;
        const barColor = over ? 'var(--color-danger)' : near ? 'var(--color-warning)' : 'var(--color-brand)';
        return (
          <li key={c.name} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3">
            <span className="truncate text-sm font-semibold">{c.name}</span>
            <span className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: barColor }}
              />
            </span>
            <span className="text-right text-sm font-semibold tabular-nums" style={{ color: over ? 'var(--color-danger)' : undefined }}>
              {c.enrolled}/{c.capacity}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
