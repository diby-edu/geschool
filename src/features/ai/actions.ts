'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { isAppError } from '@/lib/errors';
import { suggestAppreciation, saveAppreciation } from './appreciation';

function isRedirect(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

/**
 * Génère une proposition d'appréciation et la renvoie dans l'état du formulaire
 * (pas de redirection : le texte doit s'afficher pour être relu/édité).
 */
export async function suggestAppreciationAction(slug: string, bulletinId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  try {
    const ctx = await getTenantContext(slug);
    const { text, source } = await suggestAppreciation(ctx, bulletinId);
    return { values: { suggestion: text, source } };
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (isAppError(error)) return { error: error.message };
    console.error('[ai-suggest]', error);
    return { error: "L'assistant n'a pas pu générer d'appréciation." };
  }
}

export async function saveAppreciationAction(slug: string, bulletinId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await saveAppreciation(ctx, bulletinId, String(fd.get('appreciation') ?? ''));
    redirect(`/e/${slug}/bulletins/${bulletinId}?appreciation=1`);
  });
}
