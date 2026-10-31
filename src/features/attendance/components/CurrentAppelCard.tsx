'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StudentAvatar } from '@/components/ui/student-avatar';
import type { AppelHour, AppelStudent } from '@/features/attendance/registers';
import { submitOrQueue } from '@/features/attendance/offline-queue';
import { serverNow } from '@/features/attendance/server-clock';

type Status = 'PRESENT' | 'ABSENT';

/** « 15 h » ou « 15 h 30 », dans le fuseau de l'établissement. */
function hourLabel(iso: string, timezone: string): string {
  try {
    const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
    return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * L'appel heure par heure (maquette docs/maquettes/appel-par-heure.html, 0170).
 *
 * Deux états : présent (point vert) ou absent (badge rouge) ; un toucher
 * bascule. Dans un cours de plusieurs heures, chaque heure a son appel, fait
 * pendant cette heure ; la liste de l'heure suivante reprend les absents de la
 * précédente, en tête : l'enseignant ne touche que ceux qui sont arrivés.
 */
export function CurrentAppelCard({
  slug,
  occurrenceId,
  klass,
  subject,
  dateLabel,
  timeLabel,
  timezone,
  editable,
  hours,
  currentHour,
  students: initialStudents,
}: {
  slug: string;
  occurrenceId: string;
  klass: string;
  subject: string;
  dateLabel: string;
  timeLabel: string;
  timezone: string;
  editable: boolean;
  hours: AppelHour[];
  currentHour: number | null;
  students: AppelStudent[];
}) {
  const router = useRouter();
  const hour = hours.find((h) => h.hour === currentHour) ?? null;
  const multi = hours.length > 1;
  const carried = hour !== null && hour.hour > 1 && !hour.taken;
  // Ceux qui étaient absents à l'heure d'avant passent en tête de liste.
  const wasAbsent = (s: AppelStudent) => hour !== null && hour.hour > 1 && s.absentHours.includes(hour.hour - 1);

  const [students, setStudents] = useState(() =>
    [...initialStudents]
      .map((s) => ({ ...s, status: (s.status === 'ABSENT' ? 'ABSENT' : 'PRESENT') as Status }))
      .sort((a, b) => Number(wasAbsent(b)) - Number(wasAbsent(a))),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  // L'appel d'une heure validé reste modifiable TANT QUE CETTE HEURE DURE.
  const [validated, setValidated] = useState(hour?.taken ?? false);
  const locked = !editable || hour === null;

  const total = students.length;
  const absences = students.filter((s) => s.status === 'ABSENT').length;
  const span = hour ? `${hourLabel(hour.startsIso, timezone)} – ${hourLabel(hour.endsIso, timezone)}` : '';
  const startLabel = hour ? hourLabel(hour.startsIso, timezone) : '';
  const previousLabel = useMemo(() => {
    const prev = hour ? hours.find((h) => h.hour === hour.hour - 1) : undefined;
    return prev ? hourLabel(prev.startsIso, timezone) : '';
  }, [hour, hours, timezone]);

  // À la fin de l'heure, l'écran passe tout seul à l'appel de l'heure suivante
  // (la page remonte l'écran pour chaque heure : voir sa clé).
  useEffect(() => {
    if (!hour) return;
    const wait = Date.parse(hour.endsIso) - serverNow() + 1500;
    if (!(wait > 0) || wait > 4 * 3_600_000) return;
    const t = window.setTimeout(() => router.refresh(), wait);
    return () => window.clearTimeout(t);
  }, [hour, router]);

  function toggle(studentId: string) {
    if (locked || busy) return;
    setStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, status: s.status === 'ABSENT' ? 'PRESENT' : 'ABSENT' } : s)));
  }

  async function validate() {
    if (locked || busy) return;

    setBusy(true);
    setMessage(null);
    const outcome = await submitOrQueue({
      slug,
      clientOperationId: crypto.randomUUID(),
      occurrenceId,
      alsoSubmit: true,
      // L'heure du clic voyage avec l'appel : reçu après coup, il est jugé à cet
      // instant-là — et c'est lui qui dit de quelle heure du cours c'est l'appel.
      takenAt: new Date(serverNow()).toISOString(),
      label: `${klass} — ${subject}, ${dateLabel} ${multi ? span : timeLabel}`,
      entries: students.map((s) => ({ studentId: s.studentId, status: s.status, minutesLate: 0, comment: '' })),
    });

    // Valide dans les deux cas : confirme et synchronise tout de suite, ou
    // enregistre sur l'appareil pour synchronisation automatique des le
    // retour du reseau (l'enseignant n'a pas a attendre ni a reessayer).
    if (outcome.ok) {
      setValidated(true);
      setMessage({
        tone: 'success',
        text: multi
          ? `Appel de ${startLabel} validé. Vous pouvez encore le corriger jusqu’à la fin de cette heure.`
          : 'Appel validé. Vous pouvez encore le corriger tant que le cours n’est pas terminé.',
      });
      router.refresh();
    } else if (outcome.refused) {
      setMessage({ tone: 'error', text: `Appel refusé : ${outcome.refused} Il reste sur l'appareil (bouton en haut de l'écran).` });
    } else {
      setValidated(true);
      setMessage({
        tone: 'info',
        text: outcome.needsLogin
          ? "Session expirée : l'appel est gardé sur l'appareil. Reconnectez-vous, il partira seul."
          : "Pas de réseau : l'appel est gardé sur l'appareil. Il partira seul au retour de la connexion (voir le bouton en haut de l'écran).",
      });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[--radius-card] border p-4" style={{ backgroundColor: 'var(--surface)' }}>
        <p className="text-lg font-semibold">
          {klass} <span className="font-normal text-[color:var(--muted-foreground)]">— {subject}</span>
        </p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          {dateLabel} — {timeLabel}
          {multi && hour ? <> · <strong className="text-[color:var(--foreground)]">appel de {span}</strong></> : null}
        </p>

        {multi ? (
          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
            {hours.map((h) => {
              const now = h.hour === currentHour;
              const past = currentHour !== null ? h.hour < currentHour : true;
              return (
                <div
                  key={h.hour}
                  className="rounded-xl border px-1.5 py-1 text-center text-[11px] leading-tight"
                  style={
                    now
                      ? { borderColor: 'var(--color-brand)', borderWidth: 2, background: 'var(--color-brand-muted)' }
                      : h.taken
                        ? { borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)', background: 'color-mix(in srgb, var(--color-success) 10%, transparent)' }
                        : { borderColor: 'var(--border)' }
                  }
                >
                  <span className="block text-xs font-bold">
                    {hourLabel(h.startsIso, timezone)} – {hourLabel(h.endsIso, timezone)}
                  </span>
                  <span className="text-[color:var(--muted-foreground)]">
                    {now ? 'en cours' : h.taken ? `✓ ${h.absents} absent${h.absents > 1 ? 's' : ''}` : past ? 'pas d’appel' : 'à venir'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-3 flex gap-5 text-sm font-medium">
          <span>{total} Effectif</span>
          <span style={{ color: 'var(--color-success)' }}>{total - absences} Présents</span>
          <span style={{ color: 'var(--color-danger)' }}>{String(absences).padStart(2, '0')} Absents</span>
        </div>
      </div>

      {carried && !locked && !validated ? (
        <Alert tone="info">
          La liste reprend les absents de {previousLabel}. Touchez ceux qui sont arrivés.
        </Alert>
      ) : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {students.length === 0 ? (
        <Alert tone="info">Aucun élève attendu à ce cours.</Alert>
      ) : (
        <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          {students.map((s) => {
            const arrived = carried && wasAbsent(s) && s.status === 'PRESENT';
            return (
              <li key={s.studentId}>
                <button
                  type="button"
                  onClick={() => toggle(s.studentId)}
                  disabled={locked || busy}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition disabled:cursor-default hover:not-disabled:bg-[color:var(--color-brand-muted)]"
                  style={s.status === 'ABSENT' ? { background: 'color-mix(in srgb, var(--color-danger) 6%, transparent)' } : undefined}
                >
                  <StudentAvatar name={s.name} photoUrl={s.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</span>
                  </span>
                  {s.status === 'ABSENT' ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: 'color-mix(in oklch, var(--color-danger) 15%, transparent)', color: 'var(--color-danger)' }}
                    >
                      ABS
                    </span>
                  ) : arrived ? (
                    <span className="shrink-0 text-xs font-bold" style={{ color: 'var(--color-success)' }}>
                      ARRIVÉ
                    </span>
                  ) : (
                    <span aria-label="Présent" title="Présent" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {locked ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          {hour === null ? 'Le cours est terminé : l’appel est clos et ne peut plus être modifié.' : 'Appel en lecture seule.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={validate} disabled={busy || students.length === 0} className="w-full sm:w-auto">
            {busy ? 'Validation…' : validated ? 'Enregistrer les corrections' : multi ? `Valider l’appel de ${startLabel}` : "Valider l'appel"}
          </Button>
          {validated ? (
            <span className="text-sm text-[color:var(--muted-foreground)]">
              {multi ? `Appel de ${startLabel} validé — modifiable jusqu’à la fin de cette heure.` : 'Appel validé — corrigez et enregistrez à nouveau si besoin.'}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
