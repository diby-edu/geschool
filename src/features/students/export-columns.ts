/**
 * Les colonnes de l'export des élèves.
 *
 * Module neutre — ni serveur, ni client : l'export lui-même est `server-only`,
 * et un test doit pouvoir vérifier que **ce que l'application exporte se
 * réimporte tel quel**. Sans ce partage, l'en-tête serait recopié dans le test
 * et les deux dériveraient en silence à la première colonne ajoutée.
 */
export const STUDENT_EXPORT_HEADER = [
  'Matricule',
  'Nom',
  'Prénoms',
  'Sexe',
  'Date de naissance',
  'Lieu de naissance',
  'Classe',
  'Statut',
  'Redoublant',
  'Responsable',
  'Lien',
  'Téléphone du responsable',
] as const;
