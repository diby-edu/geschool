import type { StaffFunction } from '@/lib/permissions/roles';

/** Ce que la fonction fait, en une phrase, pour le choix dans le formulaire. */
export const FUNCTION_HINTS: Record<StaffFunction, string> = {
  DIRECTOR: 'Direction pédagogique, validation, signature et publication des bulletins.',
  DEPUTY_DIRECTOR: 'Seconde le directeur ; sans la facturation, les rôles ni la clôture d’année.',
  CENSOR: 'Emploi du temps, discipline, suivi pédagogique.',
  EDUCATION_INSPECTOR: 'Supérieur hiérarchique des éducateurs : supervise et valide leur travail.',
  HEAD_SUPERVISOR: 'Vie scolaire : absences, retards, discipline, transmission des accès.',
  SUPERVISOR: 'Absences, retards, discipline.',
  SECRETARY: 'Inscriptions, dossiers, documents.',
  IT_ADMIN: 'Comptes et accès ; aucun accès aux notes ni aux bulletins.',
};

export const STATE_LABEL = {
  ACTIVE: 'Actif',
  TO_ACTIVATE: 'À activer',
  SUSPENDED: 'Suspendu',
} as const;
