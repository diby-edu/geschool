'use client';

/**
 * Appels faits sur l'appareil et pas encore reçus par le serveur.
 *
 * Règle de l'établissement : un appel fait SANS RÉSEAU n'est jamais perdu,
 * quelle que soit la durée de la coupure.
 *  - Chaque appel est d'abord rangé ici, puis envoyé. Il ne quitte l'appareil
 *    que quand le serveur l'a enregistré.
 *  - L'envoi se relance seul : au chargement de n'importe quelle page de
 *    l'établissement, au retour du réseau, et toutes les 30 secondes tant
 *    qu'il en reste (AttendanceSyncButton, monté dans l'en-tête).
 *  - Le bouton de l'en-tête montre s'il reste des appels sur l'appareil, et
 *    permet de relancer l'envoi à la main.
 *  - Un appel REFUSÉ par le serveur n'est pas effacé : il reste visible avec
 *    la raison, jusqu'à ce que l'utilisateur le retire lui-même.
 *
 * L'heure où l'appel a été fait (takenAt) voyage avec lui : reçu après la fin
 * du cours, le serveur juge le droit de l'enseignant à cet instant-là.
 *
 * Chaque appel porte l'identifiant de son auteur : sur un téléphone partagé,
 * l'appel d'un enseignant n'est jamais envoyé sous le compte d'un autre.
 */

import { classifyResponse, type SendOutcome } from './offline-outcome';

export type AttendanceEntryPayload = { studentId: string; status: string; minutesLate: number; comment: string };

export type AttendanceOp = {
  slug: string;
  clientOperationId: string;
  occurrenceId: string;
  entries: AttendanceEntryPayload[];
  alsoSubmit: boolean;
  /** Instant où l'appel a été fait (ISO). */
  takenAt: string;
  /** Auteur de l'appel ; absent sur un appel rangé avant cette version. */
  userId?: string;
  /** « 6e A — Anglais, 08:00 » : pour reconnaître l'appel dans la liste. */
  label?: string;
};

export type RefusedOp = AttendanceOp & { message: string; refusedAt: string };

export type AttendanceOpResult = { registerId: string; submitted: boolean };

type Store = { pending: AttendanceOp[]; refused: RefusedOp[] };

const STORE_KEY = 'geschool.attendance.outbox.v2';
// Anciennes files (grille d'appel, carte du tableau de bord) : reprises une
// fois dans la nouvelle, pour ne rien perdre de ce qui y dort encore.
const LEGACY_KEYS = ['geschool.attendance.queue', 'geschool.attendance.validate.queue'];

export const QUEUE_EVENT = 'geschool:attendance-outbox';

let currentUserId: string | undefined;
// Appels en cours d'envoi par submitOrQueue : la relance en arrière-plan les saute.
const inFlight = new Set<string>();

/** Posé par AttendanceSyncButton : l'utilisateur connecté sur cet appareil. */
export function setOutboxUser(userId: string | undefined): void {
  currentUserId = userId;
}

function readStore(): Store {
  let store: Store = { pending: [], refused: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      store = { pending: parsed.pending ?? [], refused: parsed.refused ?? [] };
    }
    let migrated = false;
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      for (const op of JSON.parse(legacy) as Partial<AttendanceOp>[]) {
        if (!op.clientOperationId || !op.occurrenceId || !op.slug) continue;
        if (store.pending.some((p) => p.clientOperationId === op.clientOperationId)) continue;
        store.pending.push({
          slug: op.slug,
          clientOperationId: op.clientOperationId,
          occurrenceId: op.occurrenceId,
          entries: op.entries ?? [],
          alsoSubmit: op.alsoSubmit ?? false,
          // Heure inconnue : le serveur jugera à la réception ; refusé, il restera visible.
          takenAt: op.takenAt ?? '',
        });
      }
      localStorage.removeItem(key);
      migrated = true;
    }
    if (migrated) localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* stockage illisible : on repart d'une file vide, sans planter l'écran */
  }
  return store;
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* stockage plein ou bloqué : rien d'autre à faire ici */
  }
  try {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    /* hors navigateur */
  }
}

/** Un appel appartient-il à l'utilisateur connecté ? (Ancien appel sans auteur : oui.) */
function mine(op: AttendanceOp): boolean {
  return !op.userId || !currentUserId || op.userId === currentUserId;
}

export function outboxState(): { pending: AttendanceOp[]; refused: RefusedOp[] } {
  const store = readStore();
  return { pending: store.pending.filter(mine), refused: store.refused.filter(mine) };
}

export function queueLength(): number {
  return outboxState().pending.length;
}

async function send(op: AttendanceOp, source: 'ONLINE' | 'OFFLINE_SYNC'): Promise<SendOutcome> {
  let res: Response;
  try {
    res = await fetch(`/e/${op.slug}/api/attendance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientOperationId: op.clientOperationId,
        occurrenceId: op.occurrenceId,
        entries: op.entries,
        alsoSubmit: op.alsoSubmit,
        ...(op.takenAt ? { takenAt: op.takenAt } : {}),
        source,
      }),
    });
  } catch {
    return { kind: 'retry' }; // pas de réseau
  }
  const body: unknown = await res.json().catch(() => null);
  return classifyResponse({
    status: res.status,
    redirected: res.redirected,
    contentType: res.headers.get('content-type'),
    body,
  });
}

function removePending(id: string): Store {
  const store = readStore();
  store.pending = store.pending.filter((p) => p.clientOperationId !== id);
  return store;
}

/**
 * Range l'appel sur l'appareil, puis tente de l'envoyer tout de suite.
 * Rangé AVANT l'envoi : un onglet fermé pendant la requête ne perd rien
 * (le serveur est idempotent, un double envoi n'enregistre qu'une fois).
 */
export async function submitOrQueue(
  op: Omit<AttendanceOp, 'userId'>,
): Promise<
  | { ok: true; result: AttendanceOpResult; queued: false }
  | { ok: false; queued: true; refused?: string; needsLogin?: boolean }
> {
  const stored: AttendanceOp = { ...op, ...(currentUserId ? { userId: currentUserId } : {}) };
  const store = readStore();
  store.pending.push(stored);
  writeStore(store);

  inFlight.add(stored.clientOperationId);
  const outcome = await send(stored, 'ONLINE').finally(() => inFlight.delete(stored.clientOperationId));
  if (outcome.kind === 'ok') {
    writeStore(removePending(stored.clientOperationId));
    return { ok: true, result: { registerId: outcome.registerId, submitted: outcome.submitted }, queued: false };
  }
  if (outcome.kind === 'refused') {
    const after = removePending(stored.clientOperationId);
    after.refused.push({ ...stored, message: outcome.message, refusedAt: new Date().toISOString() });
    writeStore(after);
    return { ok: false, queued: true, refused: outcome.message };
  }
  return { ok: false, queued: true, needsLogin: outcome.kind === 'login' };
}

let flushing: Promise<FlushResult> | null = null;

export type FlushResult = { synced: number; remaining: number; refused: number; needsLogin: boolean };

/** Renvoie les appels en attente de l'utilisateur connecté. Un seul envoi à la fois. */
export function flushAttendanceQueue(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    let synced = 0;
    let needsLogin = false;
    for (const op of readStore().pending.filter((p) => mine(p) && !inFlight.has(p.clientOperationId))) {
      const outcome = await send(op, 'OFFLINE_SYNC');
      if (outcome.kind === 'ok') {
        writeStore(removePending(op.clientOperationId));
        synced += 1;
      } else if (outcome.kind === 'refused') {
        const after = removePending(op.clientOperationId);
        after.refused.push({ ...op, message: outcome.message, refusedAt: new Date().toISOString() });
        writeStore(after);
      } else if (outcome.kind === 'login') {
        needsLogin = true;
        break; // inutile d'insister : tous échoueront de la même façon
      } else {
        break; // réseau encore absent : on réessaiera plus tard
      }
    }
    const state = outboxState();
    return { synced, remaining: state.pending.length, refused: state.refused.length, needsLogin };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Remet un appel refusé dans la file d'envoi (après correction de l'horloge, par exemple). */
export function retryRefused(clientOperationId: string): void {
  const store = readStore();
  const op = store.refused.find((r) => r.clientOperationId === clientOperationId);
  if (!op) return;
  store.refused = store.refused.filter((r) => r.clientOperationId !== clientOperationId);
  const { message: _m, refusedAt: _r, ...back } = op;
  store.pending.push(back);
  writeStore(store);
}

/** Retire un appel refusé, sur demande explicite de l'utilisateur. */
export function dismissRefused(clientOperationId: string): void {
  const store = readStore();
  store.refused = store.refused.filter((r) => r.clientOperationId !== clientOperationId);
  writeStore(store);
}
