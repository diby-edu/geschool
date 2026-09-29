import { daysLabel, groupDays, lunchLabel, type DayPlan, type Pause } from '@/features/schedule/day-grid';

/**
 * Résumé lisible d'une grille horaire : horaires de chaque jour, récréations et
 * pause déjeuner, avec sa PORTÉE (tout l'établissement, ou un cycle). Sans lui,
 * une récréation réglée pour un cycle n'apparaissait nulle part une fois la
 * grille générée.
 */
export function GridSummary({
  dayHours,
  breaks,
  scope,
  compact = false,
}: {
  dayHours: DayPlan[];
  breaks: Pause[];
  /** « Tout l'établissement », « 1er cycle »… */
  scope: string;
  compact?: boolean;
}) {
  if (dayHours.length === 0) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Grille non configurée.</p>;
  }
  const groups = groupDays(dayHours);
  const lunch = lunchLabel(dayHours);

  return (
    <div className={compact ? 'space-y-1 text-xs' : 'space-y-1.5 text-sm'}>
      <p className="font-semibold">
        Horaires · <span className="font-normal text-[color:var(--muted-foreground)]">{scope}</span>
      </p>
      <ul className="space-y-0.5">
        {groups.map((g) => (
          <li key={g.days.join('-')}>
            <span className="first-letter:uppercase">{daysLabel(g.days)}</span> : matin {g.morning}
            {g.afternoon ? <> · après-midi {g.afternoon}</> : <> · pas de cours l’après-midi</>}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-1.5">
        {breaks.length === 0 && !lunch ? (
          <span className="text-[color:var(--muted-foreground)]">Aucune pause.</span>
        ) : (
          <>
            {breaks.map((b) => (
              <span key={`${b.start}-${b.end}`} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                {b.label} {b.start}–{b.end}
              </span>
            ))}
            {lunch ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'color-mix(in oklch, var(--color-warning) 22%, var(--surface))' }}>
                Pause déjeuner {lunch}
              </span>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
