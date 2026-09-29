/**
 * Ce qu'un écran de réinscription reçoit pour chaque élève.
 *
 * Module neutre — ni serveur, ni client : le formulaire est un composant client
 * et ne peut pas importer `./reenrollment`, qui parle à la base.
 */
export type ReenrollCandidate = {
  studentId: string;
  matricule: string;
  name: string;
  /** Redoublait déjà l'année qui se termine — l'information se reporte. */
  wasRepeating: boolean;
  /** Déjà inscrit dans l'année d'arrivée : on ne le propose plus. */
  alreadyEnrolled: boolean;
  /** « ENROLLED », ou la raison de son départ en cours d'année. */
  leftStatus: string;
};
