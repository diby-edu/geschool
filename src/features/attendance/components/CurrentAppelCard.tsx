'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { AppelStudent } from '@/features/attendance/registers';

type Status = 'PRESENT' | 'ABSENT' | 'LATE';

const NEXT_STATUS: Record<Status, Status> = { PRESENT: 'ABSENT', ABSENT: 'LATE', LATE: 'PRESENT' };
const PILL: Record<Status, { label: string; className: string }> = {
  PRESENT: { label: '🟢 Présent', className: 'text-[color:var(--color-success)]' },
  ABSENT: { label: '🔴 ABS', className: 'text-[color:var(--color-danger)]' },
  LATE: { label: '🟡 RET', className: 'text-[color:var(--color-warning)]' },
};

// Une minute de retard par defaut : aucune saisie de duree dans ce parcours
// rapide (une seule pression change l'etat). Le detail (duree exacte,
// commentaire) reste modifiable via l'ecran classique tant que l'appel n'est
// pas verrouille.
const DEFAULT_LATE_MINUTES = 5;

function normalize(status: string): Status {
  return status === 'ABSENT' || status === 'LATE' ? status : 'PRESENT';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function CurrentAppelCard({
  slug,
  occurrenceId,
  klass,
  subject,
  dateLabel,
  timeLabel,
  editable,
  students: initialStudents,
}: {
  slug: string;
  occurrenceId: string;
  klass: string;
  subject: string;
  dateLabel: string;
  timeLabel: string;
  editable: boolean;
  students: AppelStudent[];
}) {
  const router = useRouter();
  const [students, setStudents] = useState(() => initialStudents.map((s) => ({ ...s, status: normalize(s.status) })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [locked, setLocked] = useState(!editable);

  const total = students.length;
  const absences = students.filter((s) => s.status === 'ABSENT').length;
  const lates = students.filter((s) => s.status === 'LATE').length;

  function cycle(studentId: string) {
    if (locked || busy) return;
    setStudents((prev) =>
      prev.map((s) => (s.studentId === studentId ? { ...s, status: NEXT_STATUS[normalize(s.status)] } : s)),
    );
  }

  async function validate() {
    if (locked || busy) return;
    if (!window.confirm("Après validation, l'appel ne pourra plus être modifié. Voulez-vous continuer ?")) return;

    setBusy(true);
    setMessage(null);
    try {
      const saveRes = await fetch(`/e/${slug}/api/attendance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          clientOperationId: crypto.randomUUID(),
          occurrenceId,
          source: 'ONLINE',
          entries: students.map((s) => ({
            studentId: s.studentId,
            status: s.status,
            minutesLate: s.status === 'LATE' ? DEFAULT_LATE_MINUTES : 0,
            comment: '',
          })),
        }),
      });
      const saveBody = (await saveRes.json()) as { registerId?: string; error?: { message: string } };
      if (!saveRes.ok || !saveBody.registerId) {
        throw new Error(saveBody.error?.message ?? "Échec de l'enregistrement.");
      }

      const submitRes = await fetch(`/e/${slug}/api/attendance/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ registerId: saveBody.registerId }),
      });
      const submitBody = (await submitRes.json()) as { ok?: boolean; error?: { message: string } };
      if (!submitRes.ok || !submitBody.ok) {
        throw new Error(submitBody.error?.message ?? 'Échec de la validation.');
      }

      setLocked(true);
      setMessage({ tone: 'success', text: 'Appel validé. Il ne peut plus être modifié.' });
      router.refresh();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Une erreur est survenue.' });
    } finally {
      setBusy(false);
    }
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

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {students.length === 0 ? (
        <Alert tone="info">Aucun élève inscrit dans cette classe.</Alert>
      ) : (
        <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          {students.map((s) => {
            const pill = PILL[normalize(s.status)];
            return (
              <li key={s.studentId}>
                <button
                  type="button"
                  onClick={() => cycle(s.studentId)}
                  disabled={locked || busy}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition disabled:cursor-default hover:not-disabled:bg-[color:var(--color-brand-muted)]"
                >
                  {s.photoUrl ? (
                    // Photo de l'apprenant si elle existe (students.photo_url).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photoUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                      style={{ backgroundColor: 'var(--color-brand-muted)', color: 'var(--color-brand)' }}
                    >
                      {initials(s.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold ${pill.className}`}>{pill.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {locked ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Appel validé : lecture seule.</p>
      ) : (
        <Button type="button" onClick={validate} disabled={busy || students.length === 0} className="w-full sm:w-auto">
          {busy ? 'Validation…' : "Valider l'appel"}
        </Button>
      )}
    </div>
  );
}
