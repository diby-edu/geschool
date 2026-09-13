import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { toAppError } from '@/lib/errors';
import { submitRegister } from '@/features/attendance/registers';

/**
 * Verrouille un appel (OPEN -> SUBMITTED) : au-dela, l'enseignant qui l'a pris
 * ne peut plus le modifier (RLS, migration 0020). Route dediee plutot que la
 * Server Action existante (submitRegisterAction) : celle-ci redirige, ce qui
 * ne convient qu'a une soumission de formulaire — ici le bouton « Valider
 * l'appel » enchaine l'enregistrement (POST /api/attendance) puis ce
 * verrouillage en deux appels reseau simples, sans navigation.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(slug);
    const body = (await request.json()) as { registerId?: string };
    if (!body.registerId) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'registerId manquant.' } }, { status: 422 });
    }
    await submitRegister(ctx, body.registerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json({ error: appError.toClient() }, { status: appError.httpStatus });
  }
}
