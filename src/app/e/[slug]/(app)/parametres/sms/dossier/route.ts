import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { buildDossier, dossierCsv } from '@/features/sms/dossier';

/**
 * Le dossier de validation du nom d'expéditeur, à joindre à l'e-mail.
 *
 * CSV au format Excel français : il s'ouvre d'un double-clic, et un
 * « Enregistrer sous → .xlsx » suffit si l'opérateur tient à ce format.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  if (!hasPermission(ctx, 'settings.update')) {
    return new NextResponse('Accès refusé', { status: 403 });
  }

  const { row, missing } = await buildDossier(ctx);
  if (!row) {
    // On refuse de produire un fichier incomplet : c'est précisément ce qui
    // fait rejeter un dossier chez l'opérateur.
    return NextResponse.json(
      { error: 'Dossier incomplet', missing: missing.map((m) => `${m.field} (${m.where})`) },
      { status: 422 },
    );
  }

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(dossierCsv([row]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sender-${slug}-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
