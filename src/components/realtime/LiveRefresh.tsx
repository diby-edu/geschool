'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type State = 'connecting' | 'live' | 'offline';

/** Regroupe les rafales (envoi en lot : des dizaines de lignes) en un rafraichissement. */
const DEBOUNCE_MS = 150;
/** Meme sous un flot continu d'evenements, la page se met a jour au moins toutes les 1,5 s. */
const MAX_WAIT_MS = 1500;
/** Cadence de repli quand le temps reel est indisponible. */
const FALLBACK_POLL_MS = 10000;

/** Vrai si la personne est en train de saisir dans un champ. */
function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      el.matches('textarea, select, input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])'))
  );
}

/** Ecran de saisie longue (notes, appel) : il se marque `data-live-hold`. */
const isHeld = () => document.querySelector('[data-live-hold]') !== null;

/**
 * Tient l'ecran a jour en direct : des qu'une donnee est validee en base, le
 * rendu serveur est relance (`router.refresh()`) et relit les donnees avec les
 * permissions de l'utilisateur. L'evenement ne sert que de declencheur, aucune
 * donnee n'en est lue.
 *
 * Securite : Supabase Realtime evalue la RLS de chaque abonne, qui ne recoit
 * que les lignes qu'il a le droit de lire. Le filtre `school_id` limite en plus
 * le trafic a l'etablissement affiche. Les signaux de la base (suppressions,
 * retraits de visibilite) ne portent que le nom de la table, et seuls les
 * membres de l'etablissement peuvent ecouter leur canal.
 *
 * Ce qu'on ne rafraichit jamais : un ecran de saisie en cours. Pas de
 * rafraichissement pendant que la personne tape dans un champ (il reprend a la
 * sortie du champ), ni sur un ecran marque `data-live-hold` (notes, appel).
 *
 * Robustesse : si l'abonnement echoue ou se coupe, l'ecran bascule sur un
 * rafraichissement toutes les 10 s (hors ligne : rien) et l'indicateur le dit ;
 * au retour d'un onglet en arriere-plan, il se remet a jour tout de suite.
 */
export function LiveRefresh({ schoolId, tables }: { schoolId: string; tables: readonly string[] }) {
  const router = useRouter();
  const [state, setState] = useState<State>('connecting');
  const tablesKey = tables.join(',');

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let deferTimer: ReturnType<typeof setInterval> | null = null;
    let firstPendingAt = 0;
    let wasOffline = false;

    const canRefresh = () => document.visibilityState === 'visible' && navigator.onLine;
    const stopDefer = () => {
      if (deferTimer) clearInterval(deferTimer);
      deferTimer = null;
    };

    const refresh = () => {
      timer = null;
      firstPendingAt = 0;
      if (!canRefresh() || isHeld()) return;
      if (isTyping()) {
        // Repris des que la saisie s'arrete. On verifie a intervalle regulier
        // plutot que sur `focusout` : le focus peut disparaitre sans evenement
        // (champ retire de la page, fenetre non active).
        deferTimer ??= setInterval(() => {
          if (isTyping()) return;
          stopDefer();
          schedule();
        }, 300);
        return;
      }
      stopDefer();
      router.refresh();
    };
    const schedule = () => {
      const now = Date.now();
      if (firstPendingAt === 0) firstPendingAt = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(0, Math.min(DEBOUNCE_MS, firstPendingAt + MAX_WAIT_MS - now)));
    };
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (canRefresh() && !isHeld() && !isTyping()) router.refresh();
      }, FALLBACK_POLL_MS);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    const goOffline = () => {
      wasOffline = true;
      setState('offline');
      startPoll();
    };

    // Deux canaux : les changements de lignes (Postgres Changes, filtres par RLS)
    // et les signaux emis par la base pour ce que le premier ne dit pas : les
    // suppressions et les retraits de visibilite (migration 0049). L'indicateur
    // n'est « en direct » que si les deux sont connectes ; si l'un tombe (ou si
    // la migration manque), on le dit et le sondage de secours prend le relai.
    let changes: RealtimeChannel | null = null;
    let signals: RealtimeChannel | null = null;
    const ready = { changes: false, signals: false };
    const onStatus = (which: keyof typeof ready) => (status: string) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        ready[which] = true;
        if (ready.changes && ready.signals) {
          setState('live');
          stopPoll();
          // Ce qui a pu changer pendant la coupure est rattrape d'un coup.
          if (wasOffline) schedule();
          wasOffline = false;
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        ready[which] = false;
        goOffline();
      }
    };

    const connect = async () => {
      // Le client navigateur charge la session de facon asynchrone : sans ce
      // jeton donne AVANT l'abonnement, la socket s'ouvre en `anon`, la RLS ne
      // laisse passer aucun evenement et rien ne l'indique (l'abonnement reste
      // « reussi »). Verifie en base : les abonnements portaient role=anon.
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      if (!data.session) return goOffline();
      await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;

      changes = supabase.channel(`live:${schoolId}`);
      for (const table of tablesKey.split(',')) {
        changes.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `school_id=eq.${schoolId}` },
          schedule,
        );
      }
      changes.subscribe(onStatus('changes'));

      // Canal prive : la politique de realtime.messages n'y admet que les
      // membres de l'etablissement. Le nom `school:<id>` est celui qu'emet la base.
      signals = supabase.channel(`school:${schoolId}`, { config: { private: true } });
      signals.on('broadcast', { event: 'changed' }, schedule);
      signals.subscribe(onStatus('signals'));
    };
    void connect();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', schedule);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      stopDefer();
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', schedule);
      if (changes) void supabase.removeChannel(changes);
      if (signals) void supabase.removeChannel(signals);
    };
  }, [router, schoolId, tablesKey]);

  const live = state === 'live';
  return (
    <span
      role="status"
      aria-live="polite"
      title={
        live
          ? 'Les écrans se mettent à jour tout seuls dès qu’une information est validée.'
          : state === 'connecting'
            ? 'Connexion au flux en direct…'
            : 'Flux en direct indisponible : les écrans se mettent à jour toutes les 10 secondes.'
      }
      className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]"
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          live ? 'bg-[color:var(--color-success)] motion-safe:animate-pulse' : 'bg-[color:var(--muted-foreground)] opacity-60'
        }`}
      />
      <span className="hidden sm:inline">{live ? 'En direct' : state === 'connecting' ? 'Connexion…' : 'Actualisation 10 s'}</span>
    </span>
  );
}
