#!/usr/bin/env node
/**
 * Diagnostic du reseau vers Supabase (API REST, derriere Cloudflare).
 *
 *   pnpm net:check                      60 essais, IPv4 et IPv6 en alternance
 *   pnpm net:check --family=6 --n=120   IPv6 seul, 120 essais
 *   pnpm net:check --pin=64:ff9c::ac40:95f6,64:ff9c::6812:260a
 *   pnpm net:check --tls=app            chiffrement de l'application (courbes classiques)
 *
 * A lancer quand l'application redevient lente (« fetch failed », pages de
 * 10 s et plus), et depuis le VPS avant tout deploiement.
 *
 * Pourquoi ce script existe (mesure du 2026-09-21, poste de dev, reseau
 * KONO FIBRE) : par episodes, une part des connexions neuves perdait les
 * paquets de plus de ~1280 octets. La connexion securisee restait bloquee
 * (type A) ou la requete restait sans reponse puis etait fermee apres 15 s
 * (type B). Reduire la MTU IPv6 du Wi-Fi a 1280 a fait passer les echecs de
 * 6/120 a 0/120, et les remettre a 1500 les a fait revenir (4/120). Le
 * probleme est intermittent et son emplacement (fournisseur ou carte Wi-Fi)
 * n'est pas etabli : ce script permet de refaire la mesure a chaque episode.
 *
 * Chaque essai ouvre une connexion NEUVE (le probleme se tire par connexion)
 * et envoie une requete de la taille de celles de l'application (JWT, apikey
 * et cookies : ~1,5 a 2,5 Ko). Reglages TLS par defaut de Node, donc echange
 * de cles post-quantique : c'est la configuration sensible. Une reponse saine
 * arrive en ~200 ms ; sans reponse apres 3 s, l'essai compte comme un echec.
 * Un essai par seconde, jamais en parallele : ne pas en faire un banc de charge.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant.');
  process.exit(1);
}
const host = new URL(url).hostname;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = ''] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const n = Number(args.n ?? 60);
const pad = Number(args.pad ?? 1500);
const families = args.family === '4' ? [4] : args.family === '6' ? [6] : [4, 6];
const pinned = (args.pin ?? '').split(',').filter(Boolean);
// --tls=app : memes courbes que l'application (src/instrumentation-node.ts) ; sinon celles de Node.
const appTls = args.tls === 'app';
const LIMIT_MS = 3_000;

function probe(family, address) {
  return new Promise((resolve) => {
    const start = Date.now();
    let tls = null;
    let remote = null;
    let settled = false;
    const agent = new https.Agent({
      keepAlive: false,
      family: address ? undefined : family,
      ...(appTls ? { ecdhCurve: 'X25519:prime256v1:secp384r1' } : {}),
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      resolve({ ...result, remote, ms: Date.now() - start });
    };
    const req = https.request(
      {
        host: address ?? host,
        servername: host,
        path: '/rest/v1/plans?select=id&limit=1',
        agent,
        headers: { Host: host, apikey: key, Authorization: `Bearer ${key}`, 'X-Pad': 'a'.repeat(pad) },
      },
      (res) => {
        res.resume();
        res.on('end', () => finish({ ok: true }));
      },
    );
    req.on('socket', (socket) => {
      socket.on('connect', () => (remote = socket.remoteAddress));
      socket.on('secureConnect', () => (tls = Date.now() - start));
    });
    req.on('error', (error) => finish({ ok: false, why: error.code ?? error.message }));
    const timer = setTimeout(
      () => finish({ ok: false, why: tls == null ? 'bloque pendant TLS (type A)' : 'sans reponse (type B)' }),
      LIMIT_MS,
    );
    req.end();
  });
}

const stats = new Map();
console.log(`${host} : ${n} essais, +${pad} o d'en-tete, ${pinned.length ? `adresses ${pinned.join(', ')}` : `IPv${families.join(' et IPv')}`}, chiffrement ${appTls ? "de l'application" : 'par defaut de Node'}\n`);

for (let i = 0; i < n; i++) {
  const address = pinned.length ? pinned[i % pinned.length] : undefined;
  const family = address ? (address.includes(':') ? 6 : 4) : families[i % families.length];
  const r = await probe(family, address);
  const label = `IPv${family}`;
  const s = stats.get(label) ?? { total: 0, failed: 0, slow: [] };
  s.total++;
  if (r.ok) s.slow.push(r.ms);
  else {
    s.failed++;
    console.log(`  essai ${i + 1} ${label} ${r.remote ?? ''} : ECHEC, ${r.why}`);
  }
  stats.set(label, s);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.log('');
for (const [label, s] of stats) {
  const sorted = s.slow.sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : '-';
  console.log(`${label} : ${s.failed} echec(s) sur ${s.total}, reponse mediane ${median} ms`);
}
const failed = [...stats.values()].reduce((sum, s) => sum + s.failed, 0);
console.log(
  failed === 0
    ? '\nAucun echec : le reseau est sain en ce moment (ce qui ne prouve rien sur un probleme intermittent).'
    : '\nEchecs presents : episode en cours. Deconnecter/reconnecter le Wi-Fi puis relancer ce script pour savoir si la carte Wi-Fi est en cause.',
);
