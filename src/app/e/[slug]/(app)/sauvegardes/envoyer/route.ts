import path from 'node:path';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { registerUpload } from '@/services/school-backup';
import { schoolBackupDir } from '@/services/school-backup/file';

/**
 * Envoyer un fichier de sauvegarde (.gsbak) pour le remettre (0156). Le corps
 * de la requête est écrit tel quel sur le disque (une grande école pèse plus de
 * 70 Mo : rien en mémoire), puis vérifié — signature, école — avant d'être rangé.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;
  try {
    ctx = await getTenantContext(slug);
  } catch {
    return NextResponse.json({ ok: false, error: 'Accès refusé.' }, { status: 403 });
  }
  if (!hasPermission(ctx, 'backup.restore')) return NextResponse.json({ ok: false, error: 'Il faut le droit « Remettre une sauvegarde ».' }, { status: 403 });
  if (!req.body) return NextResponse.json({ ok: false, error: 'Aucun fichier reçu.' }, { status: 400 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Fichier trop gros.' }, { status: 413 });

  const dir = schoolBackupDir(ctx.school.id);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `envoi-${crypto.randomUUID()}.part`);
  let size = 0;
  try {
    const source = Readable.fromWeb(req.body as unknown as NodeReadableStream);
    source.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) source.destroy(new Error('Fichier trop gros.'));
    });
    await pipeline(source, createWriteStream(tmp));
    const r = await registerUpload({ schoolId: ctx.school.id, tmpPath: tmp, userId: ctx.user.id });
    if (!r.ok) {
      await unlink(tmp).catch(() => undefined);
      return NextResponse.json(r, { status: 422 });
    }
    await audit(ctx, { action: 'backup.upload', module: 'backup', entityType: 'school_backup', entityId: r.id });
    return NextResponse.json(r);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Envoi impossible.' }, { status: 400 });
  }
}
