'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { AppelStudent } from '@/features/attendance/registers';
import { submitOrQueue } from '@/features/attendance/offline-queue';
import { serverNow } from '@/features/attendance/server-clock';

const STATUS_OPTIONS = [
  { v: 'PRESENT', l: 'Présent' },
  { v: 'ABSENT', l: 'Absent' },
  { v: 'LATE', l: 'Retard' },
  { v: 'EXCUSED', l: 'Excusé' },
];

/**
 * Grille d'appel tolérante au hors-ligne. L'enregistrement passe par un appel
 * réseau idempotent (clientOperationId). En cas de panne, l'appel reste sur
 * l'appareil (offline-queue) et part seul au retour du réseau ; le bouton de
 * l'en-tête montre ce qui n'est pas encore envoyé.
 */
export function AppelGrid({
  slug,
  occurrenceId,
  editable,
  students: initial,
}: {
  slug: string;
  occurrenceId: string;
  editable: boolean;
  students: AppelStudent[];
}) {
  const [students, setStudents] = useState(initial);
  const [message, setMessage] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<AppelStudent>) =>
    setStudents((prev) => prev.map((s) => (s.studentId === id ? { ...s, ...patch } : s)));

  const setAllPresent = () => setStudents((prev) => prev.map((s) => ({ ...s, status: 'PRESENT' })));

  async function save() {
    setBusy(true);
    setMessage(null);
    const outcome = await submitOrQueue({
      slug,
      clientOperationId: crypto.randomUUID(),
      occurrenceId,
      alsoSubmit: false,
      takenAt: new Date(serverNow()).toISOString(),
      entries: students.map((s) => ({
        studentId: s.studentId,
        status: s.status,
        minutesLate: s.status === 'LATE' ? Math.max(1, s.minutesLate || 0) : 0,
        comment: s.comment ?? '',
      })),
    });
    if (outcome.ok) {
      setMessage({ tone: 'success', text: 'Appel enregistré.' });
    } else if (outcome.refused) {
      setMessage({ tone: 'error', text: `Appel refusé : ${outcome.refused}` });
    } else {
      setMessage({
        tone: 'info',
        text: outcome.needsLogin
          ? 'Session expirée : appel gardé sur l’appareil. Reconnectez-vous, il partira seul.'
          : 'Réseau indisponible : appel gardé sur l’appareil, il partira seul au retour de la connexion.',
      });
    }
    setBusy(false);
  }

  if (students.length === 0) return <Alert tone="info">Aucun élève attendu à ce cours.</Alert>;

  return (
    // Saisie de l'appel en cours (souvent hors ligne) : pas de rafraichissement automatique.
    <div className="space-y-3" data-live-hold>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {editable ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={setAllPresent}>Tous présents</Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[--radius-card] border">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Élève</th>
              <th className="px-3 py-2 w-36">Statut</th>
              <th className="px-3 py-2 w-24">Retard (min)</th>
              <th className="px-3 py-2">Observation</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.studentId} className="border-t">
                <td className="px-3 py-1.5 font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</td>
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5">
                  <select
                    value={s.status}
                    disabled={!editable}
                    onChange={(e) => update(s.studentId, { status: e.target.value })}
                    className="h-9 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm disabled:opacity-60"
                  >
                    {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min="0"
                    value={s.status === 'LATE' ? s.minutesLate || '' : ''}
                    disabled={!editable || s.status !== 'LATE'}
                    onChange={(e) => update(s.studentId, { minutesLate: Number(e.target.value) })}
                    className="h-9 w-20 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={s.comment ?? ''}
                    disabled={!editable}
                    maxLength={200}
                    onChange={(e) => update(s.studentId, { comment: e.target.value })}
                    className="h-9 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm disabled:opacity-60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <Button type="button" onClick={save} disabled={busy}>{busy ? 'Un instant…' : 'Enregistrer l’appel'}</Button>
      ) : (
        <p className="text-xs text-[color:var(--muted-foreground)]">Appel validé : lecture seule.</p>
      )}
    </div>
  );
}
