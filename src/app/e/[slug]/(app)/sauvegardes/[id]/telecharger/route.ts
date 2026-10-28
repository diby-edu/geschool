import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { backupFilePath } from '@/services/school-backup';

/** Télécharger une sauvegarde de l'école (0156). Droit « Sauvegarder et télécharger » ; noté au journal. */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;
  try {
    ctx = await getTenantContext(slug);
  } catch {
    return new NextResponse('Accès refusé', { status: 403 });
  }
  if (!hasPermission(ctx, 'backup.manage') && !ctx.isPlatformAdmin) return new NextResponse('Accès refusé', { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Sauvegarde inconnue', { status: 404 });
  const file = await backupFilePath(ctx.school.id, id);
  if (!file) return new NextResponse('Cette sauvegarde n’est plus sur le serveur.', { status: 404 });
  const info = await stat(file.path);
  await audit(ctx, { action: 'backup.download', module: 'backup', entityType: 'school_backup', entityId: id });
  return new NextResponse(Readable.toWeb(createReadStream(file.path)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(info.size),
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
