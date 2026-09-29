import { getTenantContext } from '@/lib/tenant/context';
import { requirePermission } from '@/lib/permissions';
import { isAppError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { isImportKind } from '@/features/import/kinds';
import { EXPORTERS, EXPORT_FILE, EXPORT_PERMISSION } from '@/features/import/export';
import { buildStudentsCsv } from '@/features/students/export';

/**
 * Export CSV d'une liste : salles, classes, enseignants, personnel, élèves.
 * Droit vérifié ICI, sur le serveur (le bouton n'est qu'une commodité) ; chaque
 * export est consigné à l'audit, c'est une sortie massive de données.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!isImportKind(kind)) return new Response('Liste inconnue.', { status: 404 });
  try {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, EXPORT_PERMISSION[kind]);
    if ((kind === 'students' || kind === 'classes') && !ctx.academicYear) {
      return new Response('Aucune année scolaire active.', { status: 409 });
    }

    const { csv, count } =
      kind === 'students' ? await buildStudentsCsv(ctx, ctx.academicYear!.id, '') : await EXPORTERS[kind](ctx);

    await audit(ctx, {
      action: `${kind === 'staff' ? 'staff' : kind}.export`,
      module: kind === 'staff' ? 'staff' : kind,
      entityType: 'school',
      entityId: ctx.school.id,
      after: { count, year: ctx.academicYear?.name ?? null },
    });

    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${EXPORT_FILE[kind]}-${slug}-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return new Response(error.code === 'FORBIDDEN' ? 'Droit requis pour exporter cette liste.' : error.message, {
        status: error.httpStatus,
      });
    }
    console.error('[export]', error);
    return new Response("L'export a échoué.", { status: 500 });
  }
}
