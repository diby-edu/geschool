import { getTenantContext } from '@/lib/tenant/context';
import { toAppError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { buildMatrix } from '@/features/reporting/matrix';
import { matrixToCsv } from '@/features/reporting/matrix-core';

/**
 * Matrice d'une classe au format Excel (CSV point-virgule, accents compris).
 * Le droit est vérifié par buildMatrix ; chaque téléchargement est consigné.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const classId = url.searchParams.get('class') ?? '';
  const periodId = url.searchParams.get('period') ?? '';
  try {
    const ctx = await getTenantContext(slug);
    const m = await buildMatrix(ctx, classId, periodId);
    await audit(ctx, { action: 'reports.matrix_export', module: 'reports', entityType: 'class', entityId: classId, after: { periodId } });
    const name = `matrice-${m.className}-${m.periodName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-');
    return new Response(matrixToCsv(m), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const e = toAppError(error);
    return new Response(e.message, { status: e.httpStatus });
  }
}
