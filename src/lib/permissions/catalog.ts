/**
 * Catalogue des droits PROPOSES à cocher dans « Rôles et droits ».
 *
 * Règle : on ne propose que ce qui a un effet réel aujourd'hui. Un droit qui ne
 * commande aucune page, aucune action ni aucune règle de la base resterait une
 * case qu'on coche sans rien obtenir : il n'apparaît pas ici tant que la
 * fonctionnalité correspondante n'existe pas (export/import d'élèves, verrouillage
 * d'emploi du temps, documents…). Ils s'ajoutent à la liste avec leur fonctionnalité.
 *
 * Libellés écrits pour le fondateur : ce que la personne PEUT FAIRE, sans jargon.
 * Le code (`module.action`) reste la référence technique ; il n'est pas affiché
 * par défaut.
 *
 * Portée : un droit accordé vaut pour TOUT l'établissement. Les enseignants
 * n'ont pas de droits réglables ici : leur périmètre (« mes classes ») est calculé
 * automatiquement à partir de leurs affectations, comme celui des parents
 * (« mes enfants »).
 */

export type PermissionItem = {
  code: string;
  label: string;
  /** Précision affichée sous le libellé : portée, dépendance. */
  hint?: string;
};

export type PermissionGroup = {
  id: string;
  label: string;
  items: PermissionItem[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    id: 'discipline',
    label: 'Discipline',
    items: [
      { code: 'discipline.view', label: 'Consulter les incidents et les sanctions', hint: 'Tout l’établissement. Un enseignant voit déjà ceux de ses élèves.' },
      { code: 'discipline.create', label: 'Signaler un incident' },
      { code: 'discipline.decide', label: 'Prononcer ou lever une sanction', hint: 'Permet aussi de classer un incident.' },
      { code: 'discipline.delete', label: 'Supprimer un incident ou une sanction' },
      { code: 'discipline.configure', label: 'Définir les motifs et les sanctions', hint: 'Le règlement intérieur de l’établissement.' },
    ],
  },
  {
    id: 'groups',
    label: 'Groupes d’élèves',
    items: [
      { code: 'groups.view', label: 'Consulter les groupes', hint: 'LV2, options, demi-groupes, soutien.' },
      { code: 'groups.create', label: 'Créer un groupe' },
      { code: 'groups.update', label: 'Modifier un groupe', hint: 'Son nom, son type, sa matière et les classes d’où il tire ses élèves.' },
      { code: 'groups.assign_students', label: 'Choisir les élèves d’un groupe' },
      { code: 'groups.delete', label: 'Supprimer un groupe' },
    ],
  },
  {
    id: 'guardians',
    label: 'Responsables légaux',
    items: [
      { code: 'guardians.create', label: 'Enregistrer un responsable légal', hint: 'Les responsables saisis à l’inscription ne passent pas par ce droit.' },
      { code: 'guardians.update', label: 'Modifier un responsable légal' },
      { code: 'guardians.delete', label: 'Supprimer un responsable légal' },
    ],
  },
  {
    id: 'enrollments',
    label: 'Vie scolaire des élèves',
    items: [
      { code: 'enrollments.view', label: 'Consulter les inscriptions' },
      { code: 'enrollments.create', label: 'Réinscrire une classe à l’année suivante' },
      { code: 'enrollments.transfer', label: 'Changer un élève de classe' },
      { code: 'enrollments.validate', label: 'Valider une inscription', hint: 'Nécessaire pour qu’un changement de classe prenne effet.' },
      { code: 'enrollments.withdraw', label: 'Enregistrer le départ d’un élève', hint: 'Transfert, retrait, scolarité achevée — et annuler un départ.' },
    ],
  },
  {
    id: 'students',
    label: 'Élèves',
    items: [
      { code: 'students.view', label: 'Consulter les fiches des élèves' },
      { code: 'students.create', label: 'Inscrire un nouvel élève' },
      { code: 'students.update', label: 'Modifier le dossier d’un élève' },
      { code: 'students.delete', label: 'Supprimer un élève', hint: 'Geste rare : l’élève disparaît des listes avec tout son dossier.' },
      { code: 'students.import', label: 'Importer une liste d’élèves', hint: 'En plus du droit d’inscrire : importer engage des centaines de dossiers d’un coup.' },
      {
        code: 'students.export',
        label: 'Exporter la liste des élèves (CSV)',
        hint: 'Le fichier contient aussi le nom et le téléphone du responsable ; chaque export est consigné.',
      },
      { code: 'guardians.view', label: 'Voir les parents et tuteurs rattachés à un élève' },
    ],
  },
  {
    id: 'teachers',
    label: 'Enseignants et affectations',
    items: [
      {
        code: 'teachers.view',
        label: 'Consulter la liste des enseignants',
        hint: 'Donne aussi le téléphone d’un enseignant dans le détail du suivi du jour (sinon il reste masqué).',
      },
      { code: 'teachers.create', label: 'Ajouter un enseignant' },
      { code: 'teachers.update', label: 'Modifier la fiche d’un enseignant' },
      { code: 'teachers.delete', label: 'Archiver un enseignant' },
      { code: 'assignments.view', label: 'Voir qui enseigne quoi, dans quelle classe' },
      { code: 'assignments.manage', label: 'Attribuer les enseignants aux classes et matières' },
    ],
  },
  {
    id: 'structure',
    label: 'Années, cycles et niveaux',
    items: [
      { code: 'academic_years.view', label: 'Voir les années scolaires et leurs périodes' },
      {
        code: 'academic_years.manage',
        label: 'Créer et modifier les années et leurs périodes',
        hint: 'Permet aussi d’ouvrir ou de fermer la période de calcul des moyennes et d’en fixer les dates.',
      },
      { code: 'academic_years.close', label: 'Clôturer une année scolaire' },
      { code: 'academic_years.reopen', label: 'Rouvrir une année clôturée' },
      { code: 'cycles.view', label: 'Voir les cycles d’enseignement' },
      { code: 'cycles.manage', label: 'Configurer les cycles' },
      { code: 'levels.view', label: 'Voir les niveaux' },
      { code: 'levels.manage', label: 'Configurer les niveaux' },
    ],
  },
  {
    id: 'classes',
    label: 'Classes, matières et salles',
    items: [
      { code: 'classes.view', label: 'Voir les classes' },
      { code: 'classes.create', label: 'Créer une classe' },
      { code: 'classes.update', label: 'Modifier une classe' },
      { code: 'classes.delete', label: 'Supprimer une classe' },
      { code: 'subjects.view', label: 'Voir les matières et le programme' },
      { code: 'subjects.create', label: 'Ajouter une matière' },
      { code: 'subjects.update', label: 'Modifier une matière et son programme' },
      { code: 'subjects.delete', label: 'Supprimer une matière' },
      { code: 'rooms.view', label: 'Voir les salles' },
      { code: 'rooms.create', label: 'Ajouter une salle' },
      { code: 'rooms.update', label: 'Modifier une salle' },
      { code: 'rooms.delete', label: 'Supprimer une salle' },
      {
        code: 'rooms.manage_availability',
        label: 'Fermer une salle ou la rendre indisponible',
        hint: 'Travaux, salle prêtée, créneau hebdomadaire réservé.',
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Emploi du temps',
    items: [
      { code: 'schedule.view', label: 'Consulter l’emploi du temps' },
      { code: 'schedule.view_all', label: 'Voir les emplois du temps de toute l’école' },
      { code: 'schedule.manage_configuration', label: 'Régler la grille horaire et les jours travaillés' },
      { code: 'schedule.create', label: 'Ajouter des besoins et des séances' },
      { code: 'schedule.update', label: 'Modifier des besoins et des séances' },
      { code: 'schedule.delete', label: 'Supprimer des besoins et des séances' },
      {
        code: 'schedule.manage_constraints',
        label: 'Définir les règles de l’emploi du temps',
        hint: 'Moments interdits, charge maximale, préférences de placement.',
      },
      { code: 'schedule.generate', label: 'Lancer la génération automatique' },
      {
        code: 'schedule.lock',
        label: 'Figer une séance',
        hint: 'Une séance figée garde sa place à la régénération suivante.',
      },
      { code: 'schedule.publish', label: 'Publier une version de l’emploi du temps' },
    ],
  },
  {
    id: 'grades',
    label: 'Évaluations et notes',
    items: [
      { code: 'assessments.view', label: 'Consulter les évaluations' },
      { code: 'assessments.create', label: 'Créer une évaluation' },
      {
        code: 'assessments.update',
        label: 'Modifier les évaluations de toute l’école',
        hint: 'Un enseignant modifie déjà les siennes sans ce droit.',
      },
      { code: 'assessments.delete', label: 'Supprimer une évaluation' },
      { code: 'grades.view', label: 'Consulter les notes saisies' },
      { code: 'grades.create', label: 'Saisir des notes' },
      { code: 'grades.update', label: 'Corriger des notes, même après clôture' },
      {
        code: 'grades.delete',
        label: 'Effacer des notes',
        hint: 'Même après clôture. Un enseignant efface déjà les siennes tant que son évaluation n’est pas clôturée.',
      },
      {
        code: 'grades.request_change',
        label: 'Demander la correction d’une note après clôture',
        hint: 'Ouvre une demande adressée à l’enseignant. Tant qu’il n’a pas accepté, la note ne bouge pas.',
      },
      {
        code: 'grades.override',
        label: 'Appliquer une correction sans l’accord de l’enseignant',
        hint: 'Geste rare, réservé à la direction : l’enseignant est prévenu et le journal porte la mention « appliqué sans son accord ».',
      },
      {
        code: 'grades.view_all',
        label: 'Voir les moyennes et classements de toute l’école',
        hint: 'Donne aussi, sur le tableau de bord, le bloc « Moyennes et bulletins » (avancement des enseignants, bulletins édités) pendant la période de calcul.',
      },
      {
        code: 'grades.validate',
        label: 'Clôturer ou rouvrir une évaluation',
        hint: 'Nécessite aussi « Modifier les évaluations de toute l’école » pour agir sur celles des autres.',
      },
      {
        code: 'grades.publish',
        label: 'Publier les notes aux familles',
        hint: 'Nécessite aussi « Modifier les évaluations de toute l’école » pour agir sur celles des autres.',
      },
      { code: 'grading.manage_scales', label: 'Gérer les barèmes de notation' },
      { code: 'grading.manage_settings', label: 'Régler les règles de calcul des moyennes' },
    ],
  },
  {
    id: 'attendance',
    label: 'Présences',
    items: [
      { code: 'attendance.view', label: 'Consulter les appels' },
      {
        code: 'attendance.view_all',
        label: 'Voir les appels de toutes les classes',
        hint: 'Donne aussi, sur le tableau de bord, le « Suivi du jour » : appels effectués, présence des élèves, enseignants n’ayant pas fait l’appel, classes à surveiller.',
      },
      { code: 'attendance.create', label: 'Faire l’appel' },
      { code: 'attendance.update', label: 'Corriger une présence après coup' },
      { code: 'attendance.validate', label: 'Valider les appels' },
      { code: 'attendance.justify', label: 'Traiter les justificatifs d’absence' },
    ],
  },
  {
    id: 'reports',
    label: 'Bulletins',
    items: [
      { code: 'reports.view', label: 'Consulter les bulletins' },
      { code: 'reports.generate', label: 'Générer les bulletins' },
      { code: 'reports.validate', label: 'Valider les bulletins (conseil de classe)' },
      {
        code: 'reports.sign',
        label: 'Signer les bulletins',
        hint: 'Étape entre la validation et la publication, prévue pour le directeur.',
      },
      { code: 'reports.publish', label: 'Publier les bulletins aux familles' },
      {
        code: 'reports.print',
        label: 'Éditer le PDF des bulletins',
        hint: 'Sortir les bulletins d’une classe entière, prêts à imprimer.',
      },
      {
        code: 'reports.manage_template',
        label: 'Modifier le modèle de bulletin',
        hint: 'Les blocs de la page, les colonnes du tableau, les textes officiels, le logo.',
      },
      {
        code: 'reports.unlock',
        label: 'Rouvrir un bulletin déjà validé',
        hint: 'Geste du directeur : le bulletin redevient modifiable, perd sa signature, et le motif reste inscrit dessus.',
      },
    ],
  },
  {
    id: 'announcements',
    label: 'Annonces',
    items: [
      { code: 'announcements.view', label: 'Lire les annonces' },
      { code: 'announcements.create', label: 'Rédiger une annonce' },
      { code: 'announcements.publish', label: 'Publier une annonce' },
    ],
  },
  {
    id: 'accounts',
    label: 'Comptes d’accès',
    items: [
      { code: 'access_accounts.view', label: 'Consulter les comptes d’accès' },
      { code: 'access_accounts.create', label: 'Créer un accès pour un enseignant' },
      { code: 'access_accounts.send', label: 'Envoyer les identifiants' },
      { code: 'access_accounts.bulk_send', label: 'Envoyer les identifiants en lot' },
      { code: 'access_accounts.resend', label: 'Renvoyer des identifiants' },
      { code: 'access_accounts.reset', label: 'Réinitialiser un mot de passe' },
      { code: 'access_accounts.disable', label: 'Suspendre un accès' },
      { code: 'access_accounts.reactivate', label: 'Réactiver un accès suspendu' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { code: 'settings.update', label: 'Modifier l’identité et les coordonnées de l’établissement' },
      { code: 'audit.view', label: 'Consulter le journal d’audit' },
      { code: 'users.view', label: 'Consulter la liste du personnel administratif' },
      {
        code: 'users.create',
        label: 'Ajouter du personnel administratif',
        hint: 'Il faut aussi « Régler les droits des fonctions » pour lui attribuer une fonction.',
      },
      { code: 'users.update', label: 'Modifier les fiches du personnel' },
      {
        code: 'users.assign_roles',
        label: 'Régler les droits des fonctions et les attribuer',
        hint: 'On ne peut accorder ou attribuer que des droits qu’on possède soi-même.',
      },
      { code: 'billing.view', label: 'Consulter l’abonnement' },
      { code: 'billing.manage', label: 'Gérer l’abonnement' },
    ],
  },
];

/** Tous les codes proposés, pour valider ce qu'envoie un formulaire. */
export const CATALOG_CODES: ReadonlySet<string> = new Set(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.code)),
);

/** Libellé d'un droit du catalogue (ou son code, pour un droit hors catalogue). */
export function permissionLabel(code: string): string {
  for (const g of PERMISSION_GROUPS) {
    const item = g.items.find((i) => i.code === code);
    if (item) return item.label;
  }
  return code;
}
