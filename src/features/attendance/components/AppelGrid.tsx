'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { AppelStudent } from '@/features/attendance/registers';

const STATUS_OPTIONS = [
  { v: 'PRESENT', l: 'Présent' },
  { v: 'ABSENT', l: 'Absent' },
  { v: 'LATE', l: 'Retard' },
  { v: 'EXCUSED', l: 'Excusé' },
];

const QUEUE_KEY = 'geschool.attendance.queue';

type Op = { slug: string; clientOperationId: string; occurrenceId: string; entries: Entry[] };
type Entry = { studentId: string; status: string; minutesLate: number; comment: string };

function readQueue(): Op[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}
function writeQueue(ops: Op[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {
    /* stockage indisponible : on ignore, l'appel en ligne reste tenté */
  }
}

async function postOp(op: Op, source: 'ONLINE' | 'OFFLINE_SYNC'): Promise<boolean> {
  try {
    const res = await fetch(`/e/${op.slug}/api/attendance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...op, source }),
    });
    return res.ok;
  } catch {
    return false; // panne réseau : à mettre en file
  }
}

/**
 * Grille d'appel tolérante au hors-ligne. L'enregistrement passe par un appel
 * réseau idempotent (clientOperationId). En cas de panne, l'opération est mise
 * en file locale (localStorage) et rejouée automatiquement au retour du réseau.
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
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const flush = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) {
      // Rien à synchroniser : on cède la main avant tout setState (l'effet ne
      // met pas à jour l'état de façon synchrone).
      await Promise.resolve();
      setPending(0);
      return;
    }
    const remaining: Op[] = [];
    for (const op of queue) {
      const ok = await postOp(op, 'OFFLINE_SYNC');
      if (!ok) remaining.push(op);
    }
    writeQueue(remaining);
    setPending(remaining.length);
    if (remaining.length < queue.length) setMessage({ tone: 'success', text: 'Appels en attente synchronisés.' });
  }, []);

  useEffect(() => {
    const run = () => void flush();
    queueMicrotask(run); // synchro initiale hors du corps de l'effet
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [flush]);

  const update = (id: string, patch: Partial<AppelStudent>) =>
    setStudents((prev) => prev.map((s) => (s.studentId === id ? { ...s, ...patch } : s)));

  const setAllPresent = () => setStudents((prev) => prev.map((s) => ({ ...s, status: 'PRESENT' })));

  async function save() {
    setBusy(true);
    setMessage(null);
    const op: Op = {
      slug,
      clientOperationId: crypto.randomUUID(),
      occurrenceId,
      entries: students.map((s) => ({
        studentId: s.studentId,
        status: s.status,
        minutesLate: s.status === 'LATE' ? Math.max(1, s.minutesLate || 0) : 0,
        comment: s.comment ?? '',
      })),
    };
    const ok = await postOp(op, 'ONLINE');
    if (ok) {
      setMessage({ tone: 'success', text: 'Appel enregistré.' });
    } else {
      const queue = readQueue();
      queue.push(op);
      writeQueue(queue);
      setPending(queue.length);
      setMessage({ tone: 'info', text: 'Réseau indisponible : appel enregistré sur l’appareil, il sera synchronisé automatiquement.' });
    }
    setBusy(false);
  }

  if (students.length === 0) return <Alert tone="info">Aucun élève inscrit dans cette classe.</Alert>;

  return (
    <div className="space-y-3">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {pending > 0 ? <Alert tone="info">{pending} appel(s) en attente de synchronisation.</Alert> : null}

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
