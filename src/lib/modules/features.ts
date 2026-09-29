/**
 * Modules activables par établissement.
 *
 * Une école n'achète pas forcément tout : certaines veulent l'emploi du temps
 * et les notes, pas la discipline ; d'autres prennent l'ensemble. Le catalogue
 * ci-dessous décrit ce qui peut être coupé, la plateforme décide école par
 * école (`school_features`, migration 0070), et l'application s'y conforme :
 * le module disparaît du menu, de la page Paramètres, et ses écrans répondent
 * « introuvable ».
 *
 * Ce qui n'est PAS ici ne se coupe jamais : élèves, classes, structure, années,
 * rôles et accès sont le socle — sans eux, il n'y a pas d'établissement.
 *
 * Ajouter un module = une ligne ici. Aucune migration : la base ne stocke que
 * les codes COUPÉS, et un code inconnu reste actif.
 */

export const FEATURES = [
  {
    code: 'schedule',
    label: 'Emploi du temps',
    description: 'Grille horaire, génération automatique, séances et remplacements.',
  },
  {
    code: 'attendance',
    label: 'Présences et absences',
    description: 'Appel par séance, justificatifs, suivi des absences.',
  },
  {
    code: 'grades',
    label: 'Notes et évaluations',
    description: 'Évaluations, saisie des notes, moyennes et classements.',
  },
  {
    code: 'bulletins',
    label: 'Bulletins et conseils de classe',
    description: 'Génération, validation, publication des bulletins.',
  },
  {
    code: 'announcements',
    label: 'Annonces et notifications',
    description: 'Messages à l’établissement, aux enseignants et aux familles.',
  },
  {
    code: 'rooms',
    label: 'Salles',
    description: 'Salles, types, équipements, affectation et occupation.',
  },
  {
    code: 'discipline',
    label: 'Discipline et sanctions',
    description: 'Incidents, sanctions, suivi du comportement.',
  },
  {
    code: 'parent_portal',
    label: 'Espace parent',
    description: 'Les familles consultent bulletins, absences et annonces.',
  },
  {
    code: 'import_export',
    label: 'Import et export',
    description: 'Listes d’élèves, d’enseignants, de classes et de salles en fichier.',
  },
] as const;

export type FeatureCode = (typeof FEATURES)[number]['code'];

export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(FEATURES.map((f) => [f.code, f.label]));

/** Un module est actif tant que la plateforme ne l'a pas explicitement coupé. */
export function featureEnabled(disabled: readonly string[] | ReadonlySet<string>, code: FeatureCode): boolean {
  return disabled instanceof Set ? !disabled.has(code) : !(disabled as readonly string[]).includes(code);
}
