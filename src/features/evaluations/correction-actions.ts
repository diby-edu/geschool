'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { requestCorrection, decideCorrection } from './corrections';

/**
 * Les gestes du circuit de correction.
 *
 * Aucun d'eux ne modifie une note directement : ils ouvrent une demande, ou
 * transmettent une réponse à la fonction en base qui, seule, touche à la note.
 */

export async function requestCorrectionAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const gradeId = String(fd.get('gradeId') ?? '');
    if (!gradeId) throw new ValidationError('Note introuvable.');
    const brut = String(fd.get('newScore') ?? '').replace(',', '.').trim();
    const absent = fd.get('newIsAbsent') === 'on';

    let newScore: number | null = null;
    if (!absent) {
      const n = Number(brut);
      if (brut === '' || !Number.isFinite(n) || n < 0) {
        throw new ValidationError('Indiquez la note corrigée, ou cochez « absent ».');
      }
      newScore = n;
    }

    await requestCorrection(ctx, {
      gradeId,
      newScore,
      newIsAbsent: absent,
      reason: String(fd.get('reason') ?? ''),
    });
    redirect(`/e/${slug}/evaluations/corrections?demande=1`);
  });
}

export async function acceptCorrectionAction(slug: string, id: string, _p: FormState): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const status = await decideCorrection(ctx, id, true);
    revalidatePath(`/e/${slug}/evaluations/corrections`);
    redirect(`/e/${slug}/evaluations/corrections?decide=${status.toLowerCase()}`);
  });
}

export async function refuseCorrectionAction(
  slug: string,
  id: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const motif = String(fd.get('decisionReason') ?? '').trim();
    if (motif.length < 5) {
      throw new ValidationError('Dites pourquoi vous refusez : votre motif figurera au journal, à côté de la demande.');
    }
    await decideCorrection(ctx, id, false, motif);
    revalidatePath(`/e/${slug}/evaluations/corrections`);
    redirect(`/e/${slug}/evaluations/corrections?decide=refused`);
  });
}

/** Passage en force par la direction. La base refuse si le droit manque. */
export async function overrideCorrectionAction(
  slug: string,
  id: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const motif = String(fd.get('decisionReason') ?? '').trim();
    if (motif.length < 5) {
      throw new ValidationError(
        'Appliquer une correction sans l’accord de l’enseignant exige un motif : il restera au journal.',
      );
    }
    await decideCorrection(ctx, id, true, motif);
    revalidatePath(`/e/${slug}/evaluations/corrections`);
    redirect(`/e/${slug}/evaluations/corrections?decide=applied_without_consent`);
  });
}
