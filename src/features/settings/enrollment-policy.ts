import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings } from './school-settings';
import { readMatriculeMode, type MatriculeMode } from './enrollment-policy-types';

export { MATRICULE_MODES, MATRICULE_MODE_LABELS, readMatriculeMode, type MatriculeMode } from './enrollment-policy-types';

/**
 * Règles d'inscription de l'établissement.
 *
 * En Côte d'Ivoire, le matricule est attribué par l'État AVANT qu'un élève
 * puisse s'inscrire quelque part : le secrétariat le recopie, il ne l'invente
 * jamais. Mais une école primaire privée, ou une école hors du pays, n'a pas
 * ce numéro — elle doit pouvoir demander à l'application de le générer.
 * D'où le réglage, plutôt qu'une supposition dans le code.
 */
export type EnrollmentPolicy = {
  matricule: MatriculeMode;
};

export const DEFAULT_ENROLLMENT_POLICY: EnrollmentPolicy = { matricule: 'STATE' };

export async function enrollmentPolicy(ctx: TenantContext): Promise<EnrollmentPolicy> {
  const settings = await readSettings(ctx, 'academic');
  return { matricule: readMatriculeMode(settings.matriculeMode) };
}

/** Le matricule est-il saisi par l'utilisateur, ou attribué par l'application ? */
export function matriculeIsRequired(policy: EnrollmentPolicy): boolean {
  return policy.matricule === 'STATE';
}
