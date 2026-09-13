/**
 * Service Worker — vitrine hors ligne (PWA).
 *
 * Strategie volontairement simple et honnete :
 *  - Fichiers construits (/_next/static, /icons) : cache d'abord (immuables,
 *    nommes par hash).
 *  - Toute autre requete GET du meme domaine (pages, donnees) : reseau
 *    d'abord ; en cas d'echec (hors ligne), on sert la derniere version mise
 *    en cache de CETTE MEME URL — jamais une donnee substituee ou inventee.
 *  - Aucune ecriture (POST/PUT/DELETE) n'est jamais interceptee : les
 *    Server Actions et /api/attendance continuent d'echouer normalement
 *    hors ligne, geres par leurs propres files d'attente locales
 *    (src/features/attendance/offline-queue.ts).
 *  - Rien d'inter-origine (les appels directs a Supabase depuis le
 *    navigateur ne passent pas par ce cache).
 *
 * A la deconnexion explicite, la page envoie CLEAR_CACHE : sur un poste
 * partage (ordinateur de salle des profs), l'utilisateur suivant ne doit
 * jamais retrouver les pages du precedent.
 *
 * CACHE_VERSION : un onglet reste ouvert pendant qu'un nouveau deploiement
 * change les noms de fichiers JS (hash de build) -> ChunkLoadError des que ce
 * cache sert une page HTML perimee referencant des fragments qui n'existent
 * plus. `activate` purge tout cache d'une version differente ; incrementer
 * CACHE_VERSION force ce nettoyage. Le filet de securite reel reste cote page
 * (src/components/pwa/ChunkErrorReload.tsx), qui recharge une seule fois sur
 * ce type d'erreur : ne pas compter uniquement sur la memoire de penser a
 * incrementer ce numero a chaque deploiement.
 */

const CACHE_VERSION = 'v2';
const RUNTIME_CACHE = `geschool-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const MAX_ENTRIES = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(RUNTIME_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .catch(() => {
        /* precache best-effort : une premiere visite en ligne le remplira de toute facon */
      }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('geschool-runtime-') && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});

async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ENTRIES;
  if (excess > 0) {
    // L'API Cache ne memorise pas la date d'acces : ce n'est pas un vrai
    // LRU, seulement un garde-fou contre une croissance illimitee.
    await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isBuildAsset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');

  if (isBuildAsset) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
          trimCache(cache);
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
        }
        throw new Error('offline-and-not-cached');
      }
    })(),
  );
});
