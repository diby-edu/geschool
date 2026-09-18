/**
 * Catalogue des modules commercialises, tel qu'affiche au public (landing et
 * wizard d'inscription). Les prix reellement factures viennent de la table
 * `modules` (jamais du client, cf. services/onboarding.ts) : ce fichier ne
 * sert qu'a l'affichage et doit rester aligne avec le seed de la migration
 * 0042.
 */

export const MODULES = [
  {
    code: 'SCOL',
    icon: '📘',
    name: 'Gestion scolaire et notes',
    desc: 'Élèves, enseignants, classes, salles, emploi du temps, notes et bulletins réunis au même endroit.',
    price: 200000,
    benefits: [
      'Bulletins prêts à imprimer, sans ressaisie',
      'Emploi du temps généré pour chaque classe',
      'Moyennes et classements calculés automatiquement',
    ],
  },
  {
    code: 'APPEL',
    icon: '✋',
    name: 'Appel numérique',
    desc: 'Les enseignants marquent la présence en quelques secondes, sans papier, depuis leur téléphone.',
    price: 100000,
    benefits: [
      'Appel pris en quelques secondes depuis le téléphone',
      'Historique de présence consultable par la direction',
    ],
  },
] as const;

/** Espace Parent : gratuit pour l'ecole, chaque famille regle ce montant par an. */
export const PARENT_PORTAL_PRICE = 2000;

export const TRIAL_DAYS = 30;

export function formatFrancs(n: number): string {
  return `${n.toLocaleString('fr-FR')} F`;
}
