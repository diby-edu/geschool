import 'server-only';

import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Client } from 'pg';
import { serverEnv } from '@/lib/env';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/features/school-backup/catalog';

/**
 * Le fichier d'une sauvegarde d'école (.gsbak) : du JSON, une ligne par paquet,
 * compressé (gzip). Première ligne : l'en-tête (école, portée, date). Puis
 * { t: table, r: [lignes] }. Puis { end: true, counts }. Dernière ligne : la
 * signature (HMAC-SHA256 de toutes les lignes précédentes) — un fichier
 * retouché, même d'un caractère, est refusé à la remise.
 */

export type BackupHeader = {
  format: typeof BACKUP_FORMAT;
  version: number;
  schoolId: string;
  schoolName: string;
  scope: 'SCHOOL' | 'YEAR';
  yearId: string | null;
  yearLabel: string | null;
  createdAt: string;
  /** Dernière migration appliquée quand la sauvegarde a été faite. */
  migration: string | null;
};

export type BackupLine = { t: string; r: Record<string, unknown>[] };

/** Clé de signature, tirée de la clé de service (jamais écrite nulle part). */
function signingKey(): Buffer {
  return crypto.createHmac('sha256', serverEnv().SUPABASE_SERVICE_ROLE_KEY).update('geschool-backup-v1').digest();
}

export function newSigner() {
  const h = crypto.createHmac('sha256', signingKey());
  return {
    line(text: string) {
      h.update(text);
      h.update('\n');
    },
    digest: () => h.digest('hex'),
  };
}

/** Sur le VPS : /var/www/geschool/school-backups/<école>. Ailleurs : le dossier temporaire. */
export function schoolBackupDir(schoolId: string): string {
  const root = process.env.SCHOOL_BACKUP_DIR || (process.platform === 'linux' ? '/var/www/geschool/school-backups' : path.join(os.tmpdir(), 'geschool-school-backups'));
  if (!/^[0-9a-f-]{36}$/.test(schoolId)) throw new Error('École invalide.');
  return path.join(root, schoolId);
}

export const isSchoolBackupFile = (name: string) => /^[a-z0-9-]+-\d{8}-\d{4}(-[a-z]+)?\.gsbak$/.test(name);

/** Connexion directe à la base (le rôle du serveur passe outre les règles d'accès : chaque requête filtre l'école elle-même). */
export async function openDb(): Promise<Client> {
  const db = new Client({ connectionString: serverEnv().DATABASE_URL, ssl: { rejectUnauthorized: false }, application_name: 'geschool-sauvegardes' });
  await db.connect();
  return db;
}

export type ReadResult =
  | { ok: true; header: BackupHeader; counts: Record<string, number> }
  | { ok: false; error: string; header?: BackupHeader | undefined };

/**
 * Relit un fichier : vérifie la signature et le format, et passe chaque paquet
 * à `onLines` (pour la remise). Sans `onLines`, vérifie seulement.
 */
export async function readBackupFile(file: string, onLines?: (line: BackupLine) => Promise<void>): Promise<ReadResult> {
  const signer = newSigner();
  let header: BackupHeader | undefined;
  let counts: Record<string, number> | undefined;
  let sig: string | undefined;
  try {
    const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const text of rl) {
      if (!text) continue;
      if (sig !== undefined) return { ok: false, error: 'Le fichier continue après sa signature : il a été modifié.' };
      const obj = JSON.parse(text) as Record<string, unknown>;
      if (typeof obj.sig === 'string') {
        sig = obj.sig;
        continue;
      }
      signer.line(text);
      if (!header) {
        if (obj.format !== BACKUP_FORMAT) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde de l’application.' };
        if (Number(obj.version) > BACKUP_FORMAT_VERSION) return { ok: false, error: 'Sauvegarde faite par une version plus récente de l’application.' };
        header = obj as unknown as BackupHeader;
        continue;
      }
      if (obj.end === true) {
        counts = (obj.counts ?? {}) as Record<string, number>;
        continue;
      }
      if (onLines && typeof obj.t === 'string' && Array.isArray(obj.r)) await onLines(obj as unknown as BackupLine);
    }
  } catch {
    return { ok: false, error: 'Fichier illisible (abîmé, incomplet ou pas une sauvegarde).', header };
  }
  if (!header || !counts) return { ok: false, error: 'Fichier incomplet.', header };
  if (!sig) return { ok: false, error: 'Fichier sans signature : il ne vient pas de l’application.', header };
  const expected = signer.digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, error: 'La signature ne correspond pas : le fichier a été modifié, ou il vient d’une autre installation.', header };
  }
  return { ok: true, header, counts };
}
