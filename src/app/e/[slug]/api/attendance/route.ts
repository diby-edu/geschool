import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { toAppError } from '@/lib/errors';
import { attendanceSaveSchema } from '@/features/attendance/schemas';
import { applyAttendanceSave } from '@/features/attendance/sync';

/**
 * Point d'application d'un appel — en ligne comme au rejeu d'un appel saisi
 * hors ligne (docs/OFFLINE_SYNC.md). Idempotent via `clientOperationId` : le
 * client peut renvoyer sans risque une opération déjà appliquée.
 *
 * Exposé en route handler (et non en Server Action) pour que le client puisse
 * intercepter une panne réseau, mettre l'opération en file locale, et la
 * rejouer au retour du réseau.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(slug);
    const body: unknown = await request.json();
    const parsed = attendanceSaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Requête invalide.' } }, { status: 422 });
    }
    const source = (body as { source?: string }).source === 'OFFLINE_SYNC' ? 'OFFLINE_SYNC' : 'ONLINE';
    const result = await applyAttendanceSave(ctx, {
      clientOperationId: parsed.data.clientOperationId,
      occurrenceId: parsed.data.occurrenceId,
      entries: parsed.data.entries,
      alsoSubmit: parsed.data.alsoSubmit,
      source,
    });
    return NextResponse.json(result);
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json({ error: appError.toClient() }, { status: appError.httpStatus });
  }
}
