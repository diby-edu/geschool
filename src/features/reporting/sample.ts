import type { BulletinDetail } from '@/features/bulletins/types';

/**
 * L'élève d'exemple de l'aperçu.
 *
 * Treize lignes : douze matières plus la Conduite. C'est le niveau le plus
 * chargé mesuré sur une vraie école — si l'aperçu tient, la page tient.
 * Les chiffres sont cohérents entre eux (moyenne, points, rang) pour qu'on
 * juge du rendu, pas d'un tableau de nombres au hasard.
 *
 * Module NEUTRE : l'éditeur est un composant client.
 */

const ligne = (
  subject: string,
  coefficient: number,
  average: number,
  rank: number,
  appreciation: string,
  teacher: string,
) => ({
  subject,
  teacher,
  appreciation,
  coefficient,
  average,
  weighted: Math.round(average * coefficient * 100) / 100,
  class_average: Math.round((average - 1.4) * 100) / 100,
  class_min: 4.5,
  class_max: 17.25,
  rank,
});

export const EXEMPLE_BULLETIN: BulletinDetail = {
  id: 'apercu',
  status: 'GENERATED',
  student: 'KOUASSI Aya Grâce',
  matricule: 'CI-2024-0084512',
  klass: '1ère D',
  period: '1er trimestre',
  school: '',
  general_average: 13.25,
  rank: 7,
  class_size: 42,
  class_average: 11.87,
  absences: 6,
  lateness: 3,
  head_teacher_comment: null,
  council_comment:
    'Trimestre solide, porté par les sciences. La philosophie et l’histoire-géographie restent en retrait : un travail régulier de rédaction les redressera.',
  distinction_label: 'Encouragements du conseil',
  distinction_note: null,
  annual_average: null,
  annual_rank: null,
  decision_label: null,
  revision: 0,
  previous: [],
  items: [
    ligne('Français', 3, 12.5, 11, 'Assez bien', 'M. KOFFI Ahmed'),
    ligne('Anglais', 2, 14.0, 8, 'Bien', 'Mme BAMBA Akissi'),
    ligne('LV2 Espagnol', 1, 15.25, 4, 'Très bien', 'M. SANOGO Ibrahim'),
    ligne('Histoire-Géographie', 2, 11.75, 19, 'Passable', 'M. TRAORÉ Seydou'),
    ligne('Mathématiques', 4, 13.25, 9, 'Assez bien', 'M. YAO Konan'),
    ligne('Physique-Chimie', 4, 12.0, 12, 'Assez bien', 'Mme KONÉ Mariam'),
    ligne('Sciences de la vie et de la Terre', 4, 14.5, 5, 'Bien', 'Mme DIARRA Aminata'),
    ligne('Philosophie', 2, 10.5, 24, 'Passable', 'M. OUATTARA Bakary'),
    ligne('Éducation civique et morale', 1, 15.5, 6, 'Très bien', 'M. TRAORÉ Seydou'),
    ligne('Informatique', 1, 14.0, 10, 'Bien', 'M. GNAMIEN Paul'),
    ligne('Éducation physique et sportive', 1, 15.0, 7, 'Très bien', 'M. COULIBALY Drissa'),
    ligne('Arts plastiques', 1, 13.0, 18, 'Assez bien', 'Mme CISSÉ Fanta'),
    ligne('Conduite', 1, 16.0, 9, 'Très bien', 'Vie scolaire'),
  ],
};
