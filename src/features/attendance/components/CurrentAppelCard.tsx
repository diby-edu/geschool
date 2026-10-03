'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StudentAvatar } from '@/components/ui/student-avatar';
import type { AppelStudent } from '@/features/attendance/registers';
import { submitOrQueue, flushAttendanceQueue, queueLength } from '@/features/attendance/offline-queue';

type Status = 'PRESENT' | 'ABSENT' | 'LATE';

const NEXT_STATUS: Record<Status, Status> = { PRESENT: 'ABSENT', ABSENT: 'LATE', LATE: 'PRESENT' };
const BADGE_COLOR: Record<'ABSENT' | 'LATE', string> = {
  ABSENT: 'var(--color-danger)',
  LATE: 'var(--color-warning)',
};
const BADGE_LABEL: Record<'ABSENT' | 'LATE', string> = { ABSENT: 'ABS', LATE: 'RET' };

// Present : un simple point vert, sans texte (etat par defaut, le moins
// bruyant). Absent/Retard : badge plein colore, pour attirer l'oeil sur les
// exceptions — reprend la maquette fournie par l'etablissement (image 2).
function StatusIndicator({ status }: { status: Status }) {
  if (status === 'PRESENT') {
    return (
      <span
        aria-label="Présent"
        title="Présent"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: 'var(--color-success)' }}
      />
    );
  }
  const color = BADGE_COLOR[status];
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`, color }}
    >
      {BADGE_LABEL[status]}
    </span>
  );
}

/**
 * Le retard n'est pas saisi : il se DEDUIT de l'heure du creneau.
 *
 * Un cours de 7h a 9h, un eleve marque en retard a 8h30 : le retard vaut
 * 1 h 30. Aucune duree en dur, aucune saisie — l'enseignant clique, l'heure
 * fait le reste.
 */
function minutesDepuisLeDebut(startsAtIso: string, instant: number): number {
  const debut = new Date(startsAtIso).getTime();
  if (!Number.isFinite(debut)) return 0;
  return Math.max(0, Math.round((instant - debut) / 60000));
}

function normalize(status: string): Status {
  return status === 'ABSENT' || status === 'LATE' ? status : 'PRESENT';
}

export function CurrentAppelCard({
  slug,
  occurrenceId,
  klass,
  subject,
  dateLabel,
  startsAt,
  timeLabel,
  editable,
  students: initialStudents,
}: {
  slug: string;
  occurrenceId: string;
  klass: string;
  subject: string;
  dateLabel: string;
  /** Debut du creneau, en ISO : sert a calculer la duree du retard. */
  startsAt: string;
  timeLabel: string;
  editable: boolean;
  students: AppelStudent[];
}) {
  const router = useRouter();
  const [students, setStudents] = useState(() => initialStudents.map((s) => ({ ...s, status: normalize(s.status) })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  // Un appel validé reste modifiable TANT QUE LE CRÉNEAU EST EN COURS : un
  // enseignant qui valide en début d'heure doit pouvoir corriger l'élève qui
  // arrive en retard. Le verrou, c'est la fin du créneau, pas la validation.
  const [validated, setValidated] = useState(false);
  const locked = !editable;
  const [pending, setPending] = useState(() => queueLength());

  const flush = useCallback(async () => {
    const { synced } = await flushAttendanceQueue();
    setPending(queueLength());
    if (synced > 0) setMessage({ tone: 'success', text: `${synced} appel(s) en attente synchronisé(s).` });
  }, []);

  useEffect(() => {
    const run = () => void flush();
    queueMicrotask(run); // synchro initiale hors du corps de l'effet
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [flush]);

  const total = students.length;
  const absences = students.filter((s) => s.status === 'ABSENT').length;
  const lates = students.filter((s) => s.status === 'LATE').length;

  // Quand un eleve passe « en retard », on retient L'INSTANT DU CLIC. Le
  // recalculer a l'enregistrement ferait grossir le retard des eleves deja
  // marques chaque fois que l'enseignant corrige quelqu'un d'autre.
  const [lateAt, setLateAt] = useState<Record<string, number>>({});

  function cycle(studentId: string) {
    if (locked || busy) return;
    setStudents((prev) =>
      prev.map((s) => {
        if (s.studentId !== studentId) return s;
        const next = NEXT_STATUS[normalize(s.status)];
        if (next === 'LATE') setLateAt((m) => ({ ...m, [studentId]: Date.now() }));
        return { ...s, status: next };
      }),
    );
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
      entries: students.map((s) => ({
        studentId: s.studentId,
        status: s.status,
        minutesLate: s.status === 'LATE' ? minutesDepuisLeDebut(startsAt, lateAt[s.studentId] ?? Date.now()) : 0,
        comment: '',
      })),
    });

    // Valide dans les deux cas : confirme et synchronise tout de suite, ou
    // enregistre sur l'appareil pour synchronisation automatique des le
    // retour du reseau (l'enseignant n'a pas a attendre ni a reessayer).
    setValidated(true);
    if (outcome.ok) {
      setMessage({
        tone: 'success',
        text: 'Appel validé. Vous pouvez encore le corriger tant que le cours n’est pas terminé.',
      });
      router.refresh();
    } else {
      setPending(queueLength());
      setMessage({
        tone: 'info',
        text: "Réseau indisponible : appel enregistré sur l'appareil, il sera synchronisé automatiquement au retour de la connexion.",
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
        </p>
        <div className="mt-3 flex gap-5 text-sm font-medium">
          <span>{total} Effectif</span>
          <span style={{ color: 'var(--color-danger)' }}>{String(absences).padStart(2, '0')} Absences</span>
          <span style={{ color: 'var(--color-warning)' }}>{String(lates).padStart(2, '0')} Retard</span>
        </div>
      </div>

      {pending > 0 ? <Alert tone="info">{pending} appel(s) en attente de synchronisation.</Alert> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {students.length === 0 ? (
        <Alert tone="info">Aucun élève inscrit dans cette classe.</Alert>
      ) : (
        <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          {students.map((s) => {
            return (
              <li key={s.studentId}>
                <button
                  type="button"
                  onClick={() => cycle(s.studentId)}
                  disabled={locked || busy}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition disabled:cursor-default hover:not-disabled:bg-[color:var(--color-brand-muted)]"
                >
                  <StudentAvatar name={s.name} photoUrl={s.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</span>
                  </span>
                  <StatusIndicator status={normalize(s.status)} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {locked ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Le cours est terminé : l’appel est clos et ne peut plus être modifié.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={validate} disabled={busy || students.length === 0} className="w-full sm:w-auto">
            {busy ? 'Validation…' : validated ? 'Enregistrer les corrections' : "Valider l'appel"}
          </Button>
          {validated ? (
            <span className="text-sm text-[color:var(--muted-foreground)]">
              Appel validé — corrigez et enregistrez à nouveau si besoin.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
