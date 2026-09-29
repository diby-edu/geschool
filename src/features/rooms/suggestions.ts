/**
 * Noms proposés pour les types de salle et les équipements.
 *
 * Ce sont des SUGGESTIONS, rien d'autre : aucune règle du code ne dépend de
 * cette liste. Une école qui a un « Atelier froid et climatisation » le saisit
 * et il fonctionne exactement pareil. Elles existent pour éviter la page
 * blanche, surtout au technique et au professionnel où les ateliers sont
 * nombreux et propres à chaque établissement.
 *
 * Le code est dérivé du nom : « Cuisine pédagogique » → « CUISINE-PEDAGO ».
 */

export type EducationTrack = 'GENERAL' | 'TECHNIQUE' | 'PROFESSIONNEL';

export type Suggestion = { code: string; name: string };

/** Une suggestion de type de salle, avec les ordres où elle a un sens. */
export type TypeSuggestion = Suggestion & { tracks: EducationTrack[] };

const make = (name: string, code: string): Suggestion => ({ name, code });

const ALL: EducationTrack[] = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];
/** Les ateliers et les salles d'application n'existent pas dans le général. */
const METIER: EducationTrack[] = ['TECHNIQUE', 'PROFESSIONNEL'];

const type = (name: string, code: string, tracks: EducationTrack[]): TypeSuggestion => ({ name, code, tracks });

/**
 * L'ordre compte : les quatre premières sont les salles d'un établissement
 * général ordinaire — la salle de classe pour le tronc commun, le laboratoire
 * pour la physique-chimie et la SVT, la salle informatique, le terrain pour
 * l'EPS. Ce sont celles qui créent une vraie contrainte d'emploi du temps.
 * Le reste suit, pour ne fermer la porte à personne.
 */
export const ROOM_TYPE_SUGGESTIONS: TypeSuggestion[] = [
  type('Salle de classe', 'CLASSE', ALL),
  type('Laboratoire', 'LABO', ALL),
  type('Salle informatique', 'INFO', ALL),
  type('Terrain de sport', 'TERRAIN', ALL),

  type('Amphithéâtre', 'AMPHI', ALL),
  type('Bibliothèque / CDI', 'CDI', ALL),
  type('Salle de langues', 'LABO-LANG', ALL),
  type('Salle de dessin / arts', 'ARTS', ALL),
  type('Salle de musique', 'MUSIQUE', ALL),
  type('Gymnase', 'GYM', ALL),
  type('Salle polyvalente', 'POLY', ALL),
  type('Salle d’examen', 'EXAM', ALL),

  type('Atelier mécanique', 'AT-MECA', METIER),
  type('Atelier électricité / électronique', 'AT-ELEC', METIER),
  type('Atelier froid et climatisation', 'AT-FROID', METIER),
  type('Atelier menuiserie', 'AT-BOIS', METIER),
  type('Atelier métallique / soudure', 'AT-METAL', METIER),
  type('Atelier couture / mode', 'AT-MODE', METIER),
  type('Atelier bâtiment / maçonnerie', 'AT-BTP', METIER),
  type('Cuisine pédagogique', 'CUISINE', METIER),
  type('Restaurant d’application', 'RESTO', METIER),
  type('Salle d’hôtellerie (étages)', 'HOTEL', METIER),
];

/**
 * Les types dont la capacité en places assises ne veut rien dire : on ne
 * compte pas les chaises d'un terrain de football.
 */
export const CAPACITY_FREE_TYPES = new Set(['TERRAIN', 'GYM']);

export const ROOM_FEATURE_SUGGESTIONS: Suggestion[] = [
  make('Vidéoprojecteur', 'VIDEOPROJ'),
  make('Tableau interactif', 'TBI'),
  make('Postes informatiques', 'POSTES'),
  make('Connexion Internet', 'INTERNET'),
  make('Paillasses', 'PAILLASSES'),
  make('Point d’eau', 'EAU'),
  make('Hotte aspirante', 'HOTTE'),
  make('Machines-outils', 'MACHINES'),
  make('Établis', 'ETABLIS'),
  make('Matériel de cuisine', 'MAT-CUISINE'),
  make('Sonorisation', 'SONO'),
  make('Climatisation', 'CLIM'),
  make('Prises électriques en nombre', 'PRISES'),
  make('Accès pour personne handicapée', 'PMR'),
];

export { suggestCode } from '@/lib/text/code';
