import { getTenantContext } from '@/lib/tenant/context';
import { requirePermission } from '@/lib/permissions';
import { isAppError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { buildStudentsCsv } from '@/features/students/export';

/**
 * Export CSV des élèves inscrits. Réservé à `students.export` (appliqué ICI, sur
 * le serveur : le bouton de la page n'est qu'une commodité). Chaque export est
 * consigné à l'audit : c'est une sortie massive de données personnelles.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, 'students.export');
    if (!ctx.academicYear) {
      return new Response('Aucune année scolaire active.', { status: 409 });
    }

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const { csv, count } = await buildStudentsCsv(ctx, ctx.academicYear.id, q);

    await audit(ctx, {
      action: 'students.export',
      module: 'students',
      entityType: 'school',
      entityId: ctx.school.id,
      after: { count, year: ctx.academicYear.name, search: q || null },
    });

    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="eleves-${slug}-${ctx.academicYear.name}-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return new Response(error.code === 'FORBIDDEN' ? 'Droit requis : exporter les élèves.' : error.message, {
        status: error.httpStatus,
      });
    }
    console.error('[students-export]', error);
    return new Response("L'export a échoué.", { status: 500 });
  }
}
