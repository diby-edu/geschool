'use client';

/**
 * L'heure du SERVEUR, même sans réseau.
 *
 * Un téléphone mal réglé (il affiche 7h quand il est 8h) ne doit pas faire
 * refuser un appel. En ligne, c'est déjà le serveur qui juge, avec sa propre
 * horloge. Hors ligne, l'appareil note l'heure de l'appel : elle doit être
 * celle du serveur, pas celle du téléphone.
 *
 * Changer de fuseau (GMT) n'y changerait rien : l'heure est déjà échangée en
 * UTC ; c'est l'horloge du téléphone elle-même qui est fausse. On mesure donc
 * son ÉCART avec le serveur à chaque fois que le réseau est là, on le garde,
 * et on corrige toutes les heures notées sur l'appareil.
 *
 * Mesure : une requête HEAD (le Service Worker ne met jamais en cache autre
 * chose qu'un GET : la réponse vient forcément du serveur) ; l'en-tête Date
 * donne l'heure du serveur à la seconde, rapportée au milieu de l'aller-retour.
 */

const STORAGE_KEY = 'geschool.clock.offset';

let offsetMs: number | null = null;

function loadOffset(): number {
  if (offsetMs !== null) return offsetMs;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw === null ? Number.NaN : Number(raw);
    offsetMs = Number.isFinite(v) ? v : 0;
  } catch {
    offsetMs = 0;
  }
  return offsetMs;
}

/** Écart serveur − téléphone, à partir d'une mesure (pur : testé). */
export function offsetFrom(serverDateHeader: string | null, sentAt: number, receivedAt: number): number | null {
  if (!serverDateHeader) return null;
  const server = Date.parse(serverDateHeader);
  if (!Number.isFinite(server)) return null;
  // L'en-tête est tronqué à la seconde : +500 ms pour viser le milieu.
  return Math.round(server + 500 - (sentAt + receivedAt) / 2);
}

/** Mesure l'écart avec le serveur (sans effet si le réseau manque). */
export async function syncServerClock(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const sentAt = Date.now();
    const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
    const receivedAt = Date.now();
    // Un aller-retour trop long rend la mesure imprécise : on garde l'ancienne.
    if (receivedAt - sentAt > 10_000) return;
    const off = offsetFrom(res.headers.get('date'), sentAt, receivedAt);
    if (off === null) return;
    offsetMs = off;
    try {
      localStorage.setItem(STORAGE_KEY, String(off));
    } catch {
      /* stockage indisponible : l'écart vaut pour cette page seulement */
    }
  } catch {
    /* pas de réseau : on garde le dernier écart connu */
  }
}

/** Maintenant, à l'heure du serveur (heure du téléphone corrigée). */
export function serverNow(): number {
  return Date.now() + loadOffset();
}
