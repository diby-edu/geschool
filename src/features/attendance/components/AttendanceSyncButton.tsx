'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, CloudUpload, CircleCheck, TriangleAlert, LoaderCircle } from 'lucide-react';
import {
  QUEUE_EVENT,
  dismissRefused,
  flushAttendanceQueue,
  outboxState,
  retryRefused,
  setOutboxUser,
  type AttendanceOp,
  type RefusedOp,
} from '@/features/attendance/offline-queue';
import { syncServerClock } from '@/features/attendance/server-clock';

const RETRY_EVERY_MS = 30_000;

function opLabel(op: AttendanceOp): string {
  if (op.label) return op.label;
  if (!op.takenAt) return 'Appel';
  const d = new Date(op.takenAt);
  return `Appel du ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Bouton de l'en-tête : dit s'il reste des appels sur l'appareil.
 *
 *  - vert « Appels envoyés » : rien en attente ;
 *  - orange « N appel(s) hors ligne » : un clic relance l'envoi (il se relance
 *    aussi seul : au chargement, au retour du réseau, et toutes les 30 s) ;
 *  - rouge « N appel(s) refusé(s) » : le serveur a dit non ; l'appel reste
 *    sur l'appareil avec la raison, l'utilisateur décide de le renvoyer ou
 *    de le retirer.
 *
 * Monté sur TOUTES les pages de l'établissement : l'envoi reprend même si
 * l'enseignant ne revient jamais sur l'écran d'appel.
 */
export function AttendanceSyncButton({ userId, alwaysVisible }: { userId: string; alwaysVisible: boolean }) {
  const [pending, setPending] = useState<AttendanceOp[]>([]);
  const [refused, setRefused] = useState<RefusedOp[]>([]);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    const s = outboxState();
    setPending(s.pending);
    setRefused(s.refused);
  }, []);

  const flush = useCallback(
    async (manual: boolean) => {
      if (manual) setBusy(true);
      const r = await flushAttendanceQueue();
      setNeedsLogin(r.needsLogin);
      refresh();
      if (manual) {
        setBusy(false);
        setNote(
          r.needsLogin
            ? 'Session expirée : reconnectez-vous, les appels restent sur l’appareil.'
            : r.remaining > 0
              ? 'Toujours pas de réseau : les appels restent sur l’appareil, ils partiront seuls.'
              : r.synced > 0
                ? `${r.synced} appel(s) envoyé(s).`
                : null,
        );
      }
    },
    [refresh],
  );

  useEffect(() => {
    setOutboxUser(userId);
    const onChange = () => refresh();
    // Au retour du réseau : remesurer l'écart d'horloge, puis envoyer.
    const onOnline = () => void syncServerClock().then(() => flush(false));
    queueMicrotask(() => {
      refresh();
      void syncServerClock();
      void flush(false);
    });
    window.addEventListener(QUEUE_EVENT, onChange);
    window.addEventListener('storage', onChange); // autre onglet
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (outboxState().pending.length > 0 && navigator.onLine) void flush(false);
    }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [userId, refresh, flush]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const nPending = pending.length;
  const nRefused = refused.length;
  if (!alwaysVisible && nPending === 0 && nRefused === 0) return null;

  const tone = nRefused > 0 ? 'var(--color-danger)' : nPending > 0 ? 'var(--color-warning)' : 'var(--color-success)';
  const Icon = busy ? LoaderCircle : nRefused > 0 ? TriangleAlert : nPending > 0 ? (typeof navigator !== 'undefined' && !navigator.onLine ? CloudOff : CloudUpload) : CircleCheck;
  const text =
    nRefused > 0
      ? `${nRefused} appel${nRefused > 1 ? 's' : ''} refusé${nRefused > 1 ? 's' : ''}`
      : nPending > 0
        ? `${nPending} appel${nPending > 1 ? 's' : ''} hors ligne`
        : 'Appels envoyés';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setNote(null);
          setOpen((v) => !v);
          if (nPending > 0) void flush(true);
        }}
        title={nPending > 0 ? 'Envoyer maintenant les appels restés sur l’appareil' : 'État des appels faits sur cet appareil'}
        className="flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors"
        style={{
          color: tone,
          backgroundColor: `color-mix(in oklch, ${tone} 10%, var(--surface))`,
          borderColor: `color-mix(in oklch, ${tone} 35%, transparent)`,
        }}
      >
        <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
        <span className="hidden sm:inline">{text}</span>
        {nPending + nRefused > 0 ? <span className="sm:hidden">{nPending + nRefused}</span> : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-[--radius-card] border p-3 text-sm shadow-lg"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          {nPending === 0 && nRefused === 0 ? (
            <p>Tous les appels faits sur cet appareil ont été reçus par le serveur.</p>
          ) : null}

          {nPending > 0 ? (
            <div className="space-y-1">
              <p className="font-semibold">En attente d’envoi ({nPending})</p>
              <ul className="space-y-0.5 text-[color:var(--muted-foreground)]">
                {pending.map((op) => (
                  <li key={op.clientOperationId}>{opLabel(op)}</li>
                ))}
              </ul>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                Ils restent sur l’appareil et partent seuls dès que le réseau revient. Ne videz pas les données du navigateur.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void flush(true)}
                className="mt-1 h-8 rounded-[--radius-card] border px-3 text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Envoi…' : 'Envoyer maintenant'}
              </button>
            </div>
          ) : null}

          {needsLogin ? (
            <p className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
              Session expirée : reconnectez-vous pour envoyer les appels. Ils ne seront pas perdus.
            </p>
          ) : null}

          {nRefused > 0 ? (
            <div className="space-y-2">
              <p className="font-semibold" style={{ color: 'var(--color-danger)' }}>
                Refusés par le serveur ({nRefused})
              </p>
              {refused.map((op) => (
                <div key={op.clientOperationId} className="rounded-[--radius-card] border p-2">
                  <p className="font-medium">{opLabel(op)}</p>
                  <p className="text-xs text-[color:var(--muted-foreground)]">{op.message}</p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        retryRefused(op.clientOperationId);
                        void flush(true);
                      }}
                      className="h-7 rounded-[--radius-card] border px-2 text-xs font-medium"
                    >
                      Renvoyer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Retirer cet appel de l’appareil ? Il ne pourra plus être envoyé.')) {
                          dismissRefused(op.clientOperationId);
                        }
                      }}
                      className="h-7 rounded-[--radius-card] px-2 text-xs font-medium"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {note ? <p className="text-xs">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
