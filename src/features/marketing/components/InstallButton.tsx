'use client';

import { useEffect, useState } from 'react';
import { useClientValue } from './useClientValue';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Bouton "Installer l'application" (PWA — le manifeste et le Service Worker
 * existent deja, cf. ServiceWorkerRegister). Chrome/Edge/Android exposent
 * `beforeinstallprompt` : on declenche l'installation native. Ailleurs (Safari
 * iPhone, Firefox...) l'evenement n'existe pas : on explique le geste manuel
 * plutot que d'afficher un bouton qui ne fait rien.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const alreadyStandalone = useClientValue(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    false,
  );
  const isIos = useClientValue(() => /iphone|ipad|ipod/i.test(navigator.userAgent), false);
  const installed = justInstalled || alreadyStandalone;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) {
      setShowHelp((v) => !v);
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'accepted') setJustInstalled(true);
  }

  if (installed) {
    return <p className="done">L&apos;application est déjà installée sur cet appareil.</p>;
  }

  return (
    <>
      <button type="button" className="mkt-pill" style={{ marginTop: '1.4rem' }} onClick={install} aria-expanded={deferred ? undefined : showHelp}>
        Installer l&apos;application
      </button>
      {showHelp ? (
        <p className="lp-install-help" role="status">
          {isIos
            ? 'Dans Safari, touchez le bouton Partager, puis « Sur l’écran d’accueil ».'
            : 'Ouvrez le menu de votre navigateur (⋮) et choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».'}
        </p>
      ) : null}
    </>
  );
}
