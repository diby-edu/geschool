#!/usr/bin/env node
/**
 * Applique les migrations SQL de supabase/migrations/ sur la base pointee par
 * DATABASE_URL.
 *
 *   pnpm db:migrate     applique ce qui manque
 *   pnpm db:status      liste sans rien appliquer
 *
 * Garanties :
 *   - ordre alphabetique strict des fichiers (0001_, 0002_, ...)
 *   - UNE TRANSACTION PAR FICHIER : une migration echoue entierement ou reussit
 *     entierement, jamais a moitie
 *   - somme de controle enregistree : modifier un fichier deja applique est
 *     detecte et refuse, au lieu de diverger silencieusement
 *   - verrou consultatif Postgres : deux executions simultanees s'excluent
 *   - rejouable sans effet
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) process.loadEnvFile(path);
}

const statusOnly = process.argv.includes('--status');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant. Copier .env.example vers .env.local et le renseigner.');
  process.exit(1);
}

if (!existsSync(migrationsDir)) {
  console.error(`Dossier introuvable : ${migrationsDir}`);
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('Aucune migration a appliquer.');
  process.exit(0);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  // Une migration lourde (index sur une grosse table) peut etre longue
  statement_timeout: 0,
});

const sha256 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

let applied = 0;

try {
  await client.connect();

  await client.query(`
    create table if not exists public._migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now(),
      duration_ms integer
    );
  `);

  // Verrou consultatif : empeche deux deploiements concurrents de se marcher
  // dessus. Le nombre est arbitraire mais doit rester stable.
  const lock = await client.query('select pg_try_advisory_lock(4815162342) as ok');
  if (!lock.rows[0].ok) {
    console.error('Une autre migration est deja en cours. Abandon.');
    process.exit(1);
  }

  const { rows } = await client.query('select name, checksum from public._migrations');
  const known = new Map(rows.map((r) => [r.name, r.checksum]));

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const checksum = sha256(sql);
    const previous = known.get(file);

    if (previous) {
      if (previous !== checksum) {
        console.error(
          `\n  ${file} a ete MODIFIE apres son application.\n` +
            `  Une migration deja jouee est immuable : creer un nouveau fichier\n` +
            `  plutot que d'editer celui-ci.\n`,
        );
        process.exit(1);
      }
      if (statusOnly) console.log(`  applique   ${file}`);
      continue;
    }

    if (statusOnly) {
      console.log(`  EN ATTENTE ${file}`);
      continue;
    }

    process.stdout.write(`  ${file} ... `);
    const startedAt = Date.now();

    try {
      await client.query('begin');
      await client.query(sql);
      const durationMs = Date.now() - startedAt;
      await client.query(
        'insert into public._migrations (name, checksum, duration_ms) values ($1, $2, $3)',
        [file, checksum, durationMs],
      );
      await client.query('commit');
      console.log(`ok (${durationMs} ms)`);
      applied += 1;
    } catch (error) {
      await client.query('rollback');
      console.log('ECHEC');
      console.error(`\n${error.message}\n`);
      if (error.position) {
        const line = sql.slice(0, Number(error.position)).split('\n').length;
        console.error(`  ligne ~${line} de ${file}\n`);
      }
      process.exit(1);
    }
  }

  if (statusOnly) {
    const pending = files.filter((f) => !known.has(f)).length;
    console.log(`\n${files.length} migration(s), ${pending} en attente.`);
  } else {
    console.log(applied === 0 ? '\nBase deja a jour.' : `\n${applied} migration(s) appliquee(s).`);
  }
} finally {
  await client.end().catch(() => {});
}
