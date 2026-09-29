/**
 * Comment l'établissement obtient le matricule d'un élève.
 *
 * Module neutre — ni serveur, ni client : le formulaire de réglage est un
 * composant client et ne peut pas importer `enrollment-policy`, qui est
 * `server-only`.
 */
export const MATRICULE_MODES = ['STATE', 'SCHOOL'] as const;
export type MatriculeMode = (typeof MATRICULE_MODES)[number];

export const MATRICULE_MODE_LABELS: Record<MatriculeMode, { title: string; hint: string }> = {
  STATE: {
    title: 'Le matricule est fourni par l’État',
    hint: 'Il est obligatoire à la saisie : le secrétariat le recopie, l’application ne l’invente jamais. C’est le cas des établissements ivoiriens.',
  },
  SCHOOL: {
    title: 'L’établissement attribue lui-même le matricule',
    hint: 'Laissé vide, il est généré automatiquement (ELV-2026-000123). Pour une école qui n’a pas de numéro officiel.',
  },
};

export function readMatriculeMode(value: unknown): MatriculeMode {
  return (MATRICULE_MODES as readonly string[]).includes(String(value)) ? (value as MatriculeMode) : 'STATE';
}
