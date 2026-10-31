/**
 * Découpe automatique des lectures dont l'adresse est trop longue.
 *
 * Une lecture « .in('id', liste) » met toute la liste dans l'adresse. Mesuré le
 * 2026-10-28 (Supabase) : au-delà d'environ 350 identifiants, la réponse renvoie
 * l'adresse dans un en-tête trop gros pour Node (« fetch failed ») ; au-delà de
 * 900 environ, Supabase répond 400. La page Présences (480 cours du jour)
 * attendait ainsi 10 s de nouvelles tentatives, puis s'affichait sans l'état
 * des appels. À l'échelle d'un vrai lycée, d'autres listes dépassent ce seuil.
 *
 * Ici, une telle lecture part en plusieurs morceaux (en parallèle, dans la
 * limite de requêtes simultanées) et les lignes sont réassemblées, triées comme
 * demandé. Seul le cas sans ambiguïté est découpé : une lecture GET, un filtre
 * « in » sur une colonne de la table elle-même, sans pagination, sans comptage,
 * sans agrégat et sans ligne unique attendue. Le reste part tel quel.
 */

const MAX_URL_LENGTH = 6_000;
const CHUNK_SIZE = 120;

type Plan = { url: URL; entries: [string, string][]; index: number; items: string[] };

function planSplit(input: Parameters<typeof fetch>[0], init?: RequestInit): Plan | null {
  if (input instanceof Request) return null;
  const href = String(input);
  if (href.length <= MAX_URL_LENGTH || !href.includes('/rest/v1/') || href.includes('/rest/v1/rpc/')) return null;
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return null;

  const headers = new Headers(init?.headers);
  if (headers.has('Range') || /count=/.test(headers.get('Prefer') ?? '') || /vnd\.pgrst\.(object|plan)/.test(headers.get('Accept') ?? '')) return null;

  const url = new URL(href);
  const entries = [...url.searchParams.entries()];
  if (entries.some(([k]) => k === 'limit' || k === 'offset')) return null;
  if (/\b(count|sum|avg|min|max)\(\)/.test(url.searchParams.get('select') ?? '')) return null;

  let index = -1;
  entries.forEach(([k, v], i) => {
    // Colonne de la table (pas d'une table liée), liste simple, sans guillemets.
    if (/^[a-z_][a-z0-9_]*$/i.test(k) && /^in\.\([^"()]*\)$/.test(v) && (index < 0 || v.length > entries[index]![1].length)) index = i;
  });
  if (index < 0) return null;
  const items = entries[index]![1].slice(4, -1).split(',').filter(Boolean);
  if (items.length <= CHUNK_SIZE) return null;
  return { url, entries, index, items };
}

/** Tri des lignes réassemblées selon « order=col.desc.nullslast,col2 » (colonnes de la table seulement). */
function sortRows(rows: Record<string, unknown>[], order: string | null): void {
  if (!order) return;
  const keys = order.split(',').map((part) => {
    const [col, ...mods] = part.split('.');
    return { col: col!, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : mods.includes('desc') };
  });
  if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/i.test(k.col))) return;
  rows.sort((a, b) => {
    for (const { col, desc, nullsFirst } of keys) {
      const x = a[col];
      const y = b[col];
      if (x === y) continue;
      if (x === null || x === undefined) return nullsFirst ? -1 : 1;
      if (y === null || y === undefined) return nullsFirst ? 1 : -1;
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}

export function splitLongIn(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const plan = planSplit(input, init);
    if (!plan) return base(input, init);

    const chunks: string[][] = [];
    for (let i = 0; i < plan.items.length; i += CHUNK_SIZE) chunks.push(plan.items.slice(i, i + CHUNK_SIZE));

    const responses = await Promise.all(
      chunks.map((chunk) => {
        const params = new URLSearchParams();
        plan.entries.forEach(([k, v], i) => params.append(k, i === plan.index ? `in.(${chunk.join(',')})` : v));
        return base(`${plan.url.origin}${plan.url.pathname}?${params.toString()}`, init);
      }),
    );
    const failed = responses.find((r) => !r.ok);
    if (failed) {
      responses.forEach((r) => r !== failed && void r.body?.cancel().catch(() => undefined));
      return failed;
    }

    const parts = await Promise.all(responses.map((r) => r.json() as Promise<unknown>));
    if (!parts.every(Array.isArray)) return new Response(JSON.stringify(parts[0]), { status: responses[0]!.status, headers: responses[0]!.headers });
    const rows = (parts as Record<string, unknown>[][]).flat();
    sortRows(rows, plan.url.searchParams.get('order'));

    const headers = new Headers(responses[0]!.headers);
    for (const h of ['content-length', 'content-range', 'content-location', 'content-encoding']) headers.delete(h);
    return new Response(JSON.stringify(rows), { status: 200, headers });
  };
}
