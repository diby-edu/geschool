#!/usr/bin/env node
/**
 * Diagnostic de connexion a la base.
 *
 *   pnpm db:check
 *
 * A lancer avant `pnpm db:migrate`, et depuis le VPS avant tout deploiement.
 *
 * Pourquoi ce script existe : Supabase propose trois chaines de connexion, et
 * une seule convient. La connexion directe (db.<ref>.supabase.co) n'a
 * d'enregistrement DNS qu'en IPv6 sur les projets recents — elle fonctionne
 * depuis certains reseaux et echoue depuis d'autres, dont la plupart des VPS.
 * L'erreur qui en resulte (ENETUNREACH, ou un delai d'attente) n'oriente pas
 * vers la cause.
 *
 *   Session pooler      aws-0-<region>.pooler.supabase.com:5432   <- celle-ci
 *   Transaction pooler  aws-0-<region>.pooler.supabase.com:6543   pas de
 *                       prepared statements : casse pg-boss et les migrations
 *   Direct              db.<ref>.supabase.co:5432                 IPv6 seul
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) process.loadEnvFile(path);
}

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL manquant.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error('DATABASE_URL n est pas une URL valide.');
  process.exit(1);
}

const host = parsed.hostname;
const port = parsed.port || '5432';

console.log(`Hote  : ${host}`);
console.log(`Port  : ${port}`);
console.log(`Base  : ${parsed.pathname.replace('/', '')}`);
console.log('');

// --- Nature de la chaine -----------------------------------------------------

const isPooler = host.includes('pooler.supabase.com');
const isDirect = /^db\..*\.supabase\.co$/.test(host);

let verdict = 'ok';

if (isDirect) {
  console.log('TYPE  : connexion DIRECTE');
  console.log('        Deconseillee : IPv6 uniquement sur les projets recents.');
  console.log('        Preferer le Session pooler (Dashboard > Connect > Session pooler).');
  verdict = 'warn';
} else if (isPooler && port === '6543') {
  console.log('TYPE  : TRANSACTION pooler (6543)');
  console.log('        INCOMPATIBLE avec les migrations et pg-boss (pas de');
  console.log('        prepared statements). Utiliser le Session pooler (5432).');
  verdict = 'error';
} else if (isPooler && port === '5432') {
  console.log('TYPE  : SESSION pooler (5432) — c est la configuration attendue.');
} else {
  console.log('TYPE  : inconnu (base auto-hebergee ?)');
}
console.log('');

// --- Resolution DNS ----------------------------------------------------------

let hasIPv4 = false;
for (const [family, record] of [
  [4, 'A'],
  [6, 'AAAA'],
]) {
  try {
    const addresses = await dns.resolve(host, record);
    console.log(`IPv${family}  : ${addresses.join(', ')}`);
    if (family === 4) hasIPv4 = true;
  } catch (error) {
    console.log(`IPv${family}  : aucun enregistrement (${error.code})`);
  }
}

if (!hasIPv4) {
  console.log('');
  console.log('        Aucune adresse IPv4 : cet hote sera injoignable depuis');
  console.log('        tout reseau sans IPv6, ce qui est le cas de la plupart');
  console.log('        des VPS. Passer au Session pooler.');
  if (verdict === 'ok') verdict = 'warn';
}
console.log('');

// --- Connexion reelle --------------------------------------------------------

const client = new pg.Client({
  connectionString: raw,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  application_name: 'geschool-db-check',
});

try {
  await client.connect();

  const info = await client.query(
    'select version() as version, current_database() as db, current_user as usr',
  );
  const row = info.rows[0];

  console.log('CONNEXION : OK');
  console.log(`  ${row.version.split(',')[0]}`);
  console.log(`  base ${row.db} · utilisateur ${row.usr}`);

  const tables = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
  );
  console.log(`  tables dans le schema public : ${tables.rows[0].n}`);

  const migrations = await client.query(
    "select to_regclass('public._migrations') is not null as present",
  );
  console.log(
    migrations.rows[0].present
      ? '  table _migrations : presente'
      : '  table _migrations : absente (aucune migration appliquee)',
  );

  const extensions = await client.query(
    "select extname from pg_extension where extname in ('pgcrypto','citext') order by extname",
  );
  const found = extensions.rows.map((r) => r.extname);
  console.log(
    `  extensions requises : ${found.length ? found.join(', ') : 'aucune (installees par la migration 0001)'}`,
  );
} catch (error) {
  console.log('CONNEXION : ECHEC');
  console.log(`  ${error.code ?? ''} ${error.message}`);
  if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
    console.log('  Symptome typique d une connexion directe en IPv6 seul.');
  }
  if (error.code === 'ENOTFOUND') {
    console.log('  Hote introuvable : verifier la chaine copiee depuis le dashboard.');
  }
  if (/password|authentication/i.test(error.message)) {
    console.log('  Mot de passe refuse : le reinitialiser dans Supabase >');
    console.log('  Settings > Database, et penser a encoder les caracteres');
    console.log('  speciaux (@ devient %40, # devient %23).');
  }
  verdict = 'error';
} finally {
  await client.end().catch(() => {});
}

process.exit(verdict === 'error' ? 1 : 0);
