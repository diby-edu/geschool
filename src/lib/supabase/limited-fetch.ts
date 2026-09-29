/**
 * `fetch` des appels SERVEUR vers Supabase (utilisateur, service_role, proxy).
 *
 * Trois protections contre des connexions qui n'aboutissent pas :
 *
 *  - Plafond de requetes simultanees. Un seul ecran en lance vingt-cinq d'un coup
 *    (tableau de bord) ; la base est distante meme en local, donc chacune ouvre sa
 *    propre connexion securisee. Sur certains reseaux (box, antivirus qui inspecte
 *    le HTTPS) une part de ces connexions simultanees reste bloquee 10 s puis echoue
 *    (`UND_ERR_CONNECT_TIMEOUT`, « fetch failed ») : l'ecran plante ou met des
 *    dizaines de secondes. Mesure : 25 appels en parallele = jusqu'a 6 echecs sur 25 ;
 *    quelques-uns a la fois = beaucoup moins, les connexions ouvertes etant reutilisees.
 *  - Une nouvelle tentative quand la connexion n'a jamais ete etablie : la requete
 *    n'est alors pas partie, la rejouer est sans risque meme pour une ecriture.
 *    Le delai de connexion (2,5 s) et l'ordre IPv4/IPv6 sont regles au demarrage,
 *    dans src/instrumentation.ts : sans cela chaque echec coute 10 s.
 *  - Une lecture (GET/HEAD, fonctions de consultation) restee sans reponse apres 1,5 s
 *    est relancee sur une connexion neuve (voir hedgedFetch) : sans cela une connexion
 *    perdue fige l'ecran 15 s.
 *
 * Reglages : SUPABASE_MAX_CONCURRENT_REQUESTS (plafond, defaut 8) et
 * SUPABASE_HEDGE_AFTER_MS (delai de relance, defaut 1500 ; 0 la desactive). Un serveur
 * bien relie au reseau qui sert beaucoup de monde peut monter le plafond et desactiver la relance.
 */

const DEFAULT_LIMIT = 8;
const DEFAULT_RETRIES = 2;
/**
 * Une reponse saine arrive en 150-250 ms : sans nouvelle apres 1,5 s, la connexion est probablement perdue.
 * Mesure sur le banc le plus dur (18 ecrans chevauches) : relance a 3 s = ecran median 3,5 s, a 1,5 s = 2,1 s,
 * a 1 s = 1,4 s. On s'arrete a 1,5 s : plus court, une lecture saine mais lente (grosse base) serait doublee
 * trop souvent, ce qui alourdit la base au moment ou elle est deja lente.
 */
const DEFAULT_HEDGE_AFTER_MS = 1_500;
const DEFAULT_HEDGES = 2;

/** Causes pour lesquelles la requete n'a pas pu partir. ECONNRESET est exclu : il peut survenir apres l'envoi. */
const NOT_SENT = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH']);

export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const code = (error.cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && NOT_SENT.has(code);
}

/**
 * Lectures sans effet de bord, que l'on peut lancer deux fois sans risque : GET/HEAD, et les fonctions SQL
 * de consultation (dashboard_*, my_*, is_*). Toute autre ecriture est exclue : une requete partie sans
 * reponse a pu etre executee. Une nouvelle fonction de consultation doit suivre ce nommage pour en profiter.
 */
export function isSafeToRepeat(input: Parameters<typeof fetch>[0], init?: RequestInit): boolean {
  if (input instanceof Request) return false;
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;
  return method === 'POST' && /\/rest\/v1\/rpc\/(dashboard_|my_|is_)/.test(String(input));
}

/**
 * Requete « doublee » : sans reponse apres `afterMs`, on lance la meme sur une connexion neuve (jusqu'a
 * `extra` fois) et on garde la premiere reponse recue ; les autres tentatives sont annulees. Une requete
 * lente mais saine n'est jamais interrompue : elle continue et peut encore gagner.
 *
 * Mesure (2026-09-21, reseau du poste de dev) : ~20 % des connexions neuves en IPv6 et ~3 % en IPv4 restent
 * sans reponse, puis sont fermees par l'autre extremite apres exactement 15 s.
 */
export function hedgedFetch(
  base: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  { afterMs, extra }: { afterMs: number; extra: number },
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let failed = 0;
    let firstError: unknown;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (done: () => void) => {
      settled = true;
      clearTimeout(timer);
      done();
    };
    const launch = () => {
      const index = controllers.length;
      const controller = new AbortController();
      controllers.push(controller);
      const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      timer = setTimeout(() => {
        if (!settled && controllers.length <= extra) launch();
      }, afterMs);

      base(input, { ...init, signal }).then(
        (response) => {
          if (settled) {
            void response.body?.cancel().catch(() => undefined); // arrivee trop tard : on libere la connexion
            return;
          }
          finish(() => {
            controllers.forEach((c, i) => i !== index && c.abort());
            resolve(response);
          });
        },
        (error) => {
          if (settled) return;
          firstError ??= error;
          failed++;
          if (failed < controllers.length) return; // d'autres tentatives sont encore en vol
          if (init?.signal?.aborted || controllers.length > extra) finish(() => reject(firstError));
          else {
            clearTimeout(timer);
            launch(); // tout a echoue : inutile d'attendre le delai
          }
        },
      );
    };
    launch();
  });
}

export function createLimitedFetch(
  base: typeof fetch,
  {
    limit = DEFAULT_LIMIT,
    retries = DEFAULT_RETRIES,
    hedgeAfterMs = DEFAULT_HEDGE_AFTER_MS,
    hedges = DEFAULT_HEDGES,
  }: { limit?: number; retries?: number; hedgeAfterMs?: number; hedges?: number } = {},
): typeof fetch {
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next(); // la place passe directement au suivant : `active` ne change pas
    else active--;
  };

  return async (input, init) => {
    // Une lecture est deja relancee par hedgedFetch ; le reste n'est rejoue que si la connexion n'a jamais abouti.
    // Une Request a un corps a usage unique : on ne peut pas la rejouer.
    const hedge = hedges > 0 && isSafeToRepeat(input, init);
    const maxAttempts = hedge || input instanceof Request ? 1 : retries + 1;
    const send: typeof fetch = hedge ? (i, o) => hedgedFetch(base, i, o, { afterMs: hedgeAfterMs, extra: hedges }) : base;
    await acquire();
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          return await send(input, init);
        } catch (error) {
          if (attempt >= maxAttempts || !isConnectionFailure(error)) throw error;
        }
      }
    } finally {
      release();
    }
  };
}

function configuredLimit(): number {
  const raw = Number(process.env.SUPABASE_MAX_CONCURRENT_REQUESTS);
  return Number.isInteger(raw) && raw >= 1 ? raw : DEFAULT_LIMIT;
}

/** SUPABASE_HEDGE_AFTER_MS : delai avant relance d'une lecture sans reponse ; 0 la desactive. */
function configuredHedge(): { hedgeAfterMs: number; hedges: number } {
  const raw = process.env.SUPABASE_HEDGE_AFTER_MS;
  const ms = raw === undefined || raw === '' ? DEFAULT_HEDGE_AFTER_MS : Number(raw);
  if (!Number.isFinite(ms) || ms < 0) return { hedgeAfterMs: DEFAULT_HEDGE_AFTER_MS, hedges: DEFAULT_HEDGES };
  return ms === 0 ? { hedgeAfterMs: DEFAULT_HEDGE_AFTER_MS, hedges: 0 } : { hedgeAfterMs: ms, hedges: DEFAULT_HEDGES };
}

/**
 * Une seule instance par processus : le plafond vaut pour l'ensemble des requetes en cours, meme si
 * Next charge ce module dans plusieurs paquets (proxy, pages, actions) ou le recharge a chaud.
 */
const SHARED_KEY = Symbol.for('geschool.supabase-fetch');
const registry = globalThis as unknown as Record<symbol, typeof fetch | undefined>;

export const supabaseFetch: typeof fetch = (registry[SHARED_KEY] ??= createLimitedFetch(
  (input, init) => fetch(input, init),
  { limit: configuredLimit(), ...configuredHedge() },
));
