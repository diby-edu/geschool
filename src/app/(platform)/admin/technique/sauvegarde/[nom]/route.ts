import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/features/platform/admin';
import { auditPlatform } from '@/lib/audit';
import { backupDir, isBackupFileName } from '@/services/db-backup';

/**
 * Télécharger une copie de la base (lot A, 0153), pour la garder aussi ailleurs
 * que sur le VPS. Super Admin seulement ; chaque téléchargement est noté.
 * Le nom est vérifié par un motif strict : impossible de lire un autre fichier.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ nom: string }> }) {
  const { nom } = await params;
  let actor: string;
  try {
    actor = (await requireAdmin()).userId;
  } catch {
    return new NextResponse('Accès refusé', { status: 403 });
  }
  if (!isBackupFileName(nom)) return new NextResponse('Fichier inconnu', { status: 404 });

  const file = path.join(backupDir(), nom);
  const info = await stat(file).catch(() => null);
  if (!info) return new NextResponse('Cette copie n’est plus sur le serveur.', { status: 404 });

  await auditPlatform(actor, { action: 'platform.backup_download', module: 'platform', after: { file: nom } });

  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'no-store',
    },
  });
}
