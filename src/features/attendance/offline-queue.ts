'use client';

/**
 * File d'attente hors ligne pour la validation d'appel (tableau de bord
 * enseignant). Repond a une question reelle : l'enseignant a besoin d'AVOIR
 * ouvert la page en ligne au moins une fois (le navigateur ne peut pas
 * deviner la liste des eleves sans reseau) — mais une fois la page chargee,
 * ce module rend la suite tolerante a une coupure : l'appareil reste
 * utilisable meme si le reseau de l'etablissement flanche pendant le cours,
 * et la synchronisation reprend seule des que la connexion revient. C'est le
 * meme mecanisme que la grille d'appel classique (AppelGrid), avec sa propre
 * cle de stockage pour ne jamais interferer avec elle.
 *
 * Une vraie utilisation « jamais connecte, meme au demarrage » (mode avion
 * integral) demanderait une PWA installable avec Service Worker — hors
 * perimetre ici, a construire separement si le besoin se confirme.
 */

export type AttendanceEntryPayload = { studentId: string; status: string; minutesLate: number; comment: string };

export type AttendanceOp = {
  slug: string;
  clientOperationId: string;
  occurrenceId: string;
  entries: AttendanceEntryPayload[];
  alsoSubmit: boolean;
};

export type AttendanceOpResult = { registerId: string; submitted: boolean };

const QUEUE_KEY = 'geschool.attendance.validate.queue';

function readQueue(): AttendanceOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as AttendanceOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(ops: AttendanceOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {
    /* stockage indisponible : on ignore, la tentative en ligne reste tentee */
  }
}

export function queueLength(): number {
  return readQueue().length;
}

async function postOp(op: AttendanceOp, source: 'ONLINE' | 'OFFLINE_SYNC'): Promise<{ ok: boolean; result?: AttendanceOpResult; message?: string }> {
  try {
    const res = await fetch(`/e/${op.slug}/api/attendance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...op, source }),
    });
    const body = (await res.json().catch(() => ({}))) as { registerId?: string; submitted?: boolean; error?: { message: string } };
    if (!res.ok || !body.registerId) {
      return { ok: false, message: body.error?.message ?? "Échec de l'enregistrement." };
    }
    return { ok: true, result: { registerId: body.registerId, submitted: body.submitted ?? false } };
  } catch {
    return { ok: false }; // panne reseau : a mettre en file
  }
}

/** Tentative immediate ; en cas d'echec reseau, met en file pour plus tard. */
export async function submitOrQueue(op: AttendanceOp): Promise<{ ok: true; result: AttendanceOpResult; queued: false } | { ok: false; queued: true }> {
  const attempt = await postOp(op, 'ONLINE');
  if (attempt.ok && attempt.result) {
    return { ok: true, result: attempt.result, queued: false };
  }
  const queue = readQueue();
  queue.push(op);
  writeQueue(queue);
  return { ok: false, queued: true };
}

/** Rejoue la file (au chargement et au retour du reseau). */
export async function flushAttendanceQueue(): Promise<{ synced: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };
  const remaining: AttendanceOp[] = [];
  for (const op of queue) {
    const attempt = await postOp(op, 'OFFLINE_SYNC');
    if (!attempt.ok) remaining.push(op);
  }
  writeQueue(remaining);
  return { synced: queue.length - remaining.length, remaining: remaining.length };
}
