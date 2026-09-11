#!/usr/bin/env node
/**
 * Regenere src/types/database.ts depuis la base pointee par DATABASE_URL.
 *
 *   pnpm db:types
 *
 * S'appuie sur la CLI Supabase, invoquee a la demande via npx : elle n'est pas
 * une dependance permanente du projet, et n'est utile qu'apres une migration.
 *
 * Le fichier produit est VERSIONNE : la CI doit pouvoir typer le projet sans
 * acces reseau a Supabase.
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'types', 'database.ts');

for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant. Copier .env.example vers .env.local et le renseigner.');
  process.exit(1);
}

const header = `/**
 * Types de la base de donnees.
 *
 * FICHIER GENERE — ne pas editer a la main.
 * Regeneration :  pnpm db:types
 *
 * Volontairement versionne : la CI doit pouvoir typer le projet sans acces a
 * la base.
 */

`;

console.log('Generation des types depuis la base...');

let output;
try {
  output = execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--db-url', url],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch {
  console.error(
    "\nLa generation a echoue.\n" +
      "  - verifier que DATABASE_URL est le 'Session pooler' (port 5432)\n" +
      '  - verifier la connectivite reseau\n',
  );
  process.exit(1);
}

if (!output.includes('export type Database')) {
  console.error("Sortie inattendue de la CLI Supabase : le fichier n'a pas ete ecrit.");
  process.exit(1);
}

const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
const next = header + output.trimStart();

if (previous === next) {
  console.log('Types deja a jour.');
  process.exit(0);
}

writeFileSync(target, next, 'utf8');
console.log(`Types ecrits dans src/types/database.ts (${next.split('\n').length} lignes).`);
console.log('Penser a committer ce fichier.');
