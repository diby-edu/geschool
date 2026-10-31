'use client';

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { removePhoneAction, savePhoneAction, setMutedAction, testPhoneAction } from '../phone-actions';

type Kind = { type: string; label: string; icon: string; who: string };

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const noSubscribe = () => () => {};

/** Ce navigateur sait-il recevoir des notifications ? Sur iPhone, seulement l'application installée. */
function detectSupport(): 'yes' | 'no' | 'ios' {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (ok) return 'yes';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !installed ? 'ios' : 'no';
}

/**
 * « Activer les notifications sur ce téléphone » (maquette, partie 3) et ce que
 * chacun coupe. Une fois par appareil : le navigateur demande la permission,
 * puis les notifications arrivent même téléphone verrouillé. La cloche, elle,
 * garde tout.
 */
export function PhoneNotifications({ publicKey, kinds, muted: initialMuted }: { publicKey: string; kinds: Kind[]; muted: string[] }) {
  const support = useSyncExternalStore(noSubscribe, detectSupport, () => 'checking' as const);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [muted, setMuted] = useState<Set<string>>(new Set(initialMuted));
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (support !== 'yes') return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setPermission(Notification.permission);
        setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => {});
  }, [support]);

  function activate() {
    setMessage(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== 'granted') {
          setMessage({ tone: 'error', text: 'Les notifications sont refusées pour ce site. Autorisez-les dans les réglages du navigateur, puis recommencez.' });
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await savePhoneAction(json, navigator.userAgent);
        if (!r.ok) {
          setMessage({ tone: 'error', text: r.error ?? 'Activation impossible.' });
          return;
        }
        setEndpoint(sub.endpoint);
        const t = await testPhoneAction();
        setMessage({ tone: 'success', text: t.ok ? 'Activé : une notification d’essai vient d’être envoyée sur ce téléphone.' : 'Activé sur ce téléphone.' });
      } catch {
        setMessage({ tone: 'error', text: 'Activation impossible sur ce navigateur.' });
      }
    });
  }

  function deactivate() {
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePhoneAction(sub.endpoint);
        await sub.unsubscribe().catch(() => false);
      }
      setEndpoint(null);
      setMessage({ tone: 'info', text: 'Notifications coupées sur ce téléphone. La cloche continue de tout garder.' });
    });
  }

  function toggle(type: string) {
    const next = new Set(muted);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setMuted(next);
    start(async () => {
      await setMutedAction([...next]);
    });
  }

  return (
    <div className="space-y-3">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {!publicKey ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Les notifications sur téléphone ne sont pas encore branchées sur ce serveur.</p>
      ) : support === 'ios' ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Sur iPhone : ajoutez d’abord l’application à l’écran d’accueil (bouton Partager, « Sur l’écran d’accueil »), ouvrez-la depuis cette icône, puis revenez ici.
        </p>
      ) : support === 'no' ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Ce navigateur ne sait pas recevoir de notifications. Essayez avec Chrome sur votre téléphone.</p>
      ) : support === 'yes' ? (
        <div className="flex flex-wrap items-center gap-3">
          {endpoint && permission === 'granted' ? (
            <>
              <span className="text-sm font-semibold text-[color:var(--color-success)]">✓ Activées sur ce téléphone</span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => {
                const t = await testPhoneAction();
                setMessage({ tone: t.ok ? 'success' : 'error', text: t.ok ? 'Essai envoyé.' : 'Essai non parti : désactivez puis réactivez.' });
              })}>
                Envoyer un essai
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={deactivate}>
                Désactiver
              </Button>
            </>
          ) : (
            <Button type="button" disabled={pending} onClick={activate}>
              {pending ? 'Un instant…' : 'Activer les notifications sur ce téléphone'}
            </Button>
          )}
        </div>
      ) : null}

      {kinds.length > 0 ? (
        <div className="overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Sur le téléphone</th>
                <th className="w-20 px-3 py-2 text-center">Reçu</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => {
                const on = !muted.has(k.type);
                return (
                  <tr key={k.type} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2">
                      <span className="mr-1.5" aria-hidden>{k.icon}</span>
                      {k.label}
                      <span className="block text-xs text-[color:var(--muted-foreground)]">{k.who}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${k.label} : ${on ? 'reçu' : 'coupé'}`}
                        onClick={() => toggle(k.type)}
                        className="relative inline-block h-5 w-9 rounded-full transition-colors"
                        style={{ background: on ? 'var(--color-success)' : 'var(--border)' }}
                      >
                        <span className="absolute top-0.5 size-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-xs text-[color:var(--muted-foreground)]" style={{ borderColor: 'var(--border)' }}>
            Couper un type ne vaut que pour le téléphone : la cloche garde tout.
          </p>
        </div>
      ) : null}
    </div>
  );
}
