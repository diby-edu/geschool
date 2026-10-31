import type { AppelHour, AppelStudent } from '@/features/attendance/registers';

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  EXCUSED: 'Excusé',
  // Retards saisis avant l'appel par heure (0170) : l'élève était là.
  LATE: 'Présent',
};

/** « 14 h », dans le fuseau de l'établissement. */
function shortHour(iso: string, timezone: string): string {
  try {
    const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
    return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * L'appel d'un cours, en consultation (vie scolaire, direction) : l'état de
 * chaque élève et, dans un cours de plusieurs heures, les heures manquées
 * (0170). L'appel lui-même se fait par l'enseignant, dans CurrentAppelCard.
 */
export function AppelGrid({ students, hours, timezone }: { students: AppelStudent[]; hours: AppelHour[]; timezone: string }) {
  const multi = hours.length > 1;
  const span = (h: number) => {
    const x = hours.find((y) => y.hour === h);
    return x ? `${shortHour(x.startsIso, timezone)}–${shortHour(x.endsIso, timezone)}` : `${h}e h`;
  };
  if (students.length === 0) return <p className="text-sm text-[color:var(--muted-foreground)]">Aucun élève attendu à ce cours.</p>;

  return (
    <div className="space-y-3">
      {multi ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {hours.map((h) => (
            <span key={h.hour} className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)' }}>
              <strong>{span(h.hour)}</strong> · {h.taken ? `${h.absents} absent${h.absents > 1 ? 's' : ''}` : 'pas d’appel'}
            </span>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-[--radius-card] border">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Élève</th>
              <th className="px-3 py-2">État</th>
              {multi ? <th className="px-3 py-2">Heures d’absence</th> : null}
              <th className="px-3 py-2">Observation</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const absent = s.absentHours.length > 0;
              return (
                <tr key={s.studentId} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</td>
                  <td className="px-3 py-1.5">{s.name}</td>
                  <td className="px-3 py-1.5" style={absent ? { color: 'var(--color-danger)', fontWeight: 600 } : undefined}>
                    {absent ? (STATUS_LABEL[s.status === 'EXCUSED' ? 'EXCUSED' : 'ABSENT']) : STATUS_LABEL.PRESENT}
                  </td>
                  {multi ? (
                    <td className="px-3 py-1.5 text-xs">
                      {absent ? `${s.absentHours.length} h · ${s.absentHours.map(span).join(', ')}` : '—'}
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5 text-xs text-[color:var(--muted-foreground)]">{s.comment || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
