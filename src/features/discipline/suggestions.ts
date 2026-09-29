import type { Suggestion } from '@/components/forms/NamedListForm';

/**
 * Motifs d'incident et sanctions proposés au démarrage.
 *
 * Comme pour les salles : ce sont des SUGGESTIONS, pas des règles. Chaque
 * établissement a son règlement intérieur, son vocabulaire et son barème ;
 * il crée les siens, renomme, supprime. Aucune ligne de code ne dépend de
 * cette liste.
 */

export const INCIDENT_SUGGESTIONS: Suggestion[] = [
  { name: 'Retard répété', code: 'RETARD' },
  { name: 'Absence non justifiée', code: 'ABSENCE' },
  { name: 'Bavardage en classe', code: 'BAVARDAGE' },
  { name: 'Insolence envers un adulte', code: 'INSOLENCE' },
  { name: 'Devoirs non faits', code: 'DEVOIRS' },
  { name: 'Matériel oublié', code: 'MATERIEL' },
  { name: 'Tricherie', code: 'TRICHERIE' },
  { name: 'Bagarre', code: 'BAGARRE' },
  { name: 'Violence verbale', code: 'VIOLENCE-VERBALE' },
  { name: 'Dégradation de matériel', code: 'DEGRADATION' },
  { name: 'Vol', code: 'VOL' },
  { name: 'Tenue non conforme', code: 'TENUE' },
  { name: 'Téléphone en classe', code: 'TELEPHONE' },
  { name: 'Sortie non autorisée', code: 'SORTIE' },
];

export const SANCTION_SUGGESTIONS: Suggestion[] = [
  { name: 'Avertissement oral', code: 'AVERT-ORAL' },
  { name: 'Avertissement écrit', code: 'AVERT-ECRIT' },
  { name: 'Convocation des parents', code: 'CONVOCATION' },
  { name: 'Travail supplémentaire', code: 'TRAVAIL-SUP' },
  { name: 'Retenue', code: 'RETENUE' },
  { name: 'Exclusion de cours', code: 'EXCL-COURS' },
  { name: 'Exclusion temporaire', code: 'EXCL-TEMP' },
  { name: 'Exclusion définitive', code: 'EXCL-DEF' },
  { name: 'Conseil de discipline', code: 'CONSEIL-DISC' },
  { name: 'Blâme', code: 'BLAME' },
];

/** Sanctions qui courent sur plusieurs jours : la date de fin y a un sens. */
export const DATED_SANCTION_CODES = ['EXCL-TEMP', 'EXCL-DEF', 'RETENUE'];
