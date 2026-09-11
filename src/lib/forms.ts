import 'server-only';

import { z } from 'zod';
import { isAppError } from '@/lib/errors';

/**
 * Convention de retour des Server Actions de formulaire (useActionState).
 *
 * En cas de succes, l'action redirige cote serveur (redirect()) et ne renvoie
 * donc rien — c'est le patron retenu au lot 3, plus fiable qu'une redirection
 * cliente. `FormState` ne sert qu'a remonter les erreurs :
 *   - `error`       message global (permission, conflit, indisponible)
 *   - `fieldErrors` erreurs par champ, affichees sous chaque input
 */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
};

/** Traduit une erreur Zod en fieldErrors exploitables par le formulaire. */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Enveloppe une action metier : traduit les erreurs connues (validation, RBAC,
 * conflit) en FormState propre, et laisse passer la redirection de Next.
 *
 * La redirection reussie (`redirect()`) leve une erreur speciale `NEXT_REDIRECT`
 * qu'il ne faut SURTOUT pas avaler — on la relance.
 */
export async function runFormAction(fn: () => Promise<never | void>): Promise<FormState> {
  try {
    await fn();
    return {};
  } catch (error) {
    // Redirection Next : relancer telle quelle
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as { digest: unknown }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      return { error: 'Certains champs sont invalides.', fieldErrors: zodFieldErrors(error) };
    }
    if (isAppError(error)) {
      return { error: error.message };
    }
    console.error('[form-action]', error);
    return { error: "Une erreur inattendue s'est produite." };
  }
}

/** Extrait les champs texte d'un FormData en objet simple. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
