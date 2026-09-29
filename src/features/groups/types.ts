/**
 * Les formes échangées avec les écrans des groupes.
 *
 * Module neutre — ni serveur, ni client : un composant client ne peut pas
 * importer `./service`, qui parle à la base. Il reçoit ses données en props,
 * et c'est ce type-là qu'il attend.
 */
export type GroupStudent = {
  studentId: string;
  matricule: string;
  name: string;
  className: string | null;
  /** Déjà dans le groupe au chargement de l'écran. */
  inGroup: boolean;
};
