import type { MyScheduleSlot } from '../my-schedule';

const DAY_LABEL: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

export function MyWeekSchedule({ slots }: { slots: MyScheduleSlot[] }) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-[color:var(--muted-foreground)]">
        Aucune seance dans l&apos;emploi du temps publie de l&apos;annee en cours.
      </p>
    );
  }

  const byDay = new Map<number, MyScheduleSlot[]>();
  for (const s of slots) {
    const list = byDay.get(s.dayOfWeek) ?? [];
    list.push(s);
    byDay.set(s.dayOfWeek, list);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            {DAY_LABEL[day] ?? `Jour ${day}`}
          </h3>
          <ul className="space-y-1.5">
            {(byDay.get(day) ?? []).map((s) => (
              <li
                key={s.sessionId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[--radius-card] border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <span className="font-mono text-xs font-semibold tabular-nums text-[color:var(--color-brand)]">
                  {s.startsAt}–{s.endsAt}
                </span>
                <span className="font-semibold">{s.className}</span>
                <span className="text-[color:var(--muted-foreground)]">— {s.subject}</span>
                {s.room ? <span className="text-xs text-[color:var(--muted-foreground)]">Salle {s.room}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
