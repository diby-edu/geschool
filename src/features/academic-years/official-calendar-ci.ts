/**
 * Calendrier scolaire officiel de Côte d'Ivoire (Ministère de l'Éducation
 * nationale, de l'Alphabétisation et de l'Enseignement technique) : découpage de
 * l'année et congés scolaires. Appliqué sur demande à une année de
 * l'établissement (fiche de l'année), puis modifiable comme toute saisie.
 *
 * Deux calendriers coexistent :
 *   - l'enseignement GÉNÉRAL fonctionne par trimestres ;
 *   - l'enseignement TECHNIQUE et la formation PROFESSIONNELLE fonctionnent par
 *     semestres, avec leurs propres dates de congés (rentrée commune, mais
 *     Toussaint plus tard, congé de février décalé, grandes vacances plus tôt).
 *
 * Les congés s'enregistrent comme événements de calendrier qui bloquent
 * l'emploi du temps : aucune séance n'est prévue ces jours-là, donc aucun appel
 * n'est attendu. Un congé ne vaut que pour les ordres qu'il vise.
 */

import type { EducationTrack } from '@/features/structure/official-tracks';
import { periodScopeLabel } from './periods-by-track';

export type OfficialPeriod = { sequence: number; name: string; startsOn: string; endsOn: string };
export type OfficialBreak = { name: string; kind: 'VACATION' | 'PUBLIC_HOLIDAY'; startsOn: string; endsOn: string };

export type OfficialCalendar = {
  source: string;
  /** Trimestres de l'enseignement général. */
  periods: OfficialPeriod[];
  /** Semestres de l'enseignement technique et de la formation professionnelle. */
  semesters: OfficialPeriod[];
  /** Congés de l'enseignement général. */
  breaks: OfficialBreak[];
  /** Congés du technique et du professionnel : mêmes fêtes, dates différentes. */
  technicalBreaks: OfficialBreak[];
};

/**
 * Les fêtes musulmanes (lendemain de la Nuit du Destin, Korité, Tabaski,
 * lendemain du Maouloud) sont fériées, mais leur date suit la lune et n'est fixée
 * qu'en cours d'année par le gouvernement : l'établissement les ajoute quand
 * elles sont annoncées. Aucune date n'est devinée ici.
 */
export const MOVABLE_HOLIDAYS_NOTE =
  'Les fêtes musulmanes (Korité, Tabaski, Maouloud, lendemain de la Nuit du Destin) sont fixées chaque année par le gouvernement : ajoutez-les dans « Congés et jours fériés » dès que leurs dates sont annoncées.';

/**
 * Jours fériés à date connue qui tombent PENDANT les cours, communs aux deux
 * calendriers (les autres — Toussaint, Noël, Jour de l'an, lundi de Pâques —
 * sont déjà couverts par les congés). Pâques 2027 = 28 mars : Ascension = +39
 * jours, lundi de Pentecôte = +50 jours.
 */
const PUBLIC_HOLIDAYS_2026_2027: OfficialBreak[] = [
  { name: 'Journée nationale de la Paix', kind: 'PUBLIC_HOLIDAY', startsOn: '2026-11-15', endsOn: '2026-11-15' },
  { name: 'Fête du Travail', kind: 'PUBLIC_HOLIDAY', startsOn: '2027-05-01', endsOn: '2027-05-01' },
  { name: 'Ascension', kind: 'PUBLIC_HOLIDAY', startsOn: '2027-05-06', endsOn: '2027-05-06' },
  { name: 'Lundi de Pentecôte', kind: 'PUBLIC_HOLIDAY', startsOn: '2027-05-17', endsOn: '2027-05-17' },
];

export const OFFICIAL_CALENDARS_CI: Readonly<Record<string, OfficialCalendar>> = {
  '2026-2027': {
    source: 'Calendriers scolaires 2026-2027 du Ministère de l’Éducation nationale (général) et de l’Enseignement technique et de la Formation professionnelle',
    periods: [
      { sequence: 1, name: '1er trimestre', startsOn: '2026-09-14', endsOn: '2026-12-04' },
      { sequence: 2, name: '2e trimestre', startsOn: '2026-12-07', endsOn: '2027-03-12' },
      { sequence: 3, name: '3e trimestre', startsOn: '2027-03-15', endsOn: '2027-06-11' },
    ],
    // 1er semestre : 16 semaines (640 h) ; 2e semestre : 15 semaines (600 h).
    semesters: [
      { sequence: 1, name: '1er semestre', startsOn: '2026-09-14', endsOn: '2027-01-22' },
      { sequence: 2, name: '2e semestre', startsOn: '2027-01-25', endsOn: '2027-05-28' },
    ],
    breaks: [
      { name: 'Congés de Toussaint', kind: 'VACATION', startsOn: '2026-10-23', endsOn: '2026-11-01' },
      { name: 'Congés de Noël', kind: 'VACATION', startsOn: '2026-12-18', endsOn: '2027-01-03' },
      { name: 'Congé de février', kind: 'VACATION', startsOn: '2027-02-05', endsOn: '2027-02-14' },
      { name: 'Congés de Pâques', kind: 'VACATION', startsOn: '2027-03-19', endsOn: '2027-04-04' },
      { name: 'Grandes vacances', kind: 'VACATION', startsOn: '2027-07-30', endsOn: '2027-09-12' },
      ...PUBLIC_HOLIDAYS_2026_2027,
    ],
    technicalBreaks: [
      { name: 'Congés de Toussaint', kind: 'VACATION', startsOn: '2026-10-27', endsOn: '2026-11-01' },
      { name: 'Congés de Noël', kind: 'VACATION', startsOn: '2026-12-18', endsOn: '2027-01-03' },
      { name: 'Congé de février', kind: 'VACATION', startsOn: '2027-02-16', endsOn: '2027-02-21' },
      { name: 'Congés de Pâques', kind: 'VACATION', startsOn: '2027-03-23', endsOn: '2027-04-04' },
      { name: 'Grandes vacances', kind: 'VACATION', startsOn: '2027-07-16', endsOn: '2027-09-12' },
      ...PUBLIC_HOLIDAYS_2026_2027,
    ],
  },
};

/** Calendrier officiel d'une année, d'après son nom (« 2026-2027 », « 2026 - 2027 »…). */
export function officialCalendarFor(yearName: string): OfficialCalendar | null {
  const key = yearName.replace(/\s+/g, '').replace(/[/–—]/g, '-');
  return OFFICIAL_CALENDARS_CI[key] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Qui est concerné, et comment les congés sont nommés                        */
/* -------------------------------------------------------------------------- */

export type OfficialScopes = {
  /** L'établissement a-t-il l'enseignement général (donc des trimestres) ? */
  hasGeneral: boolean;
  /** Ses ordres à semestres : technique, professionnel, ou les deux. */
  techPro: ('TECHNIQUE' | 'PROFESSIONNEL')[];
  /** Les deux découpages cohabitent : il faut alors préciser qui est concerné. */
  both: boolean;
  generalScope: EducationTrack[] | null;
  techScope: EducationTrack[] | null;
  /** Suffixe ajouté au nom des congés quand les deux calendriers cohabitent. */
  generalSuffix: string;
  techSuffix: string;
};

/**
 * Ce que le calendrier officiel pose dans CET établissement, d'après ses ordres
 * d'enseignement. Partagé par l'écran (aperçu, « déjà appliqué ») et par le
 * service qui écrit : les deux ne peuvent donc pas diverger.
 */
export function officialScopes(schoolTracks: readonly string[]): OfficialScopes {
  const hasGeneral = schoolTracks.length === 0 || schoolTracks.includes('GENERAL');
  const techPro = (['TECHNIQUE', 'PROFESSIONNEL'] as const).filter((t) => schoolTracks.includes(t));
  const both = hasGeneral && techPro.length > 0;
  return {
    hasGeneral,
    techPro: [...techPro],
    both,
    generalScope: both ? ['GENERAL'] : null,
    techScope: both ? [...techPro] : null,
    generalSuffix: both ? 'général' : '',
    techSuffix: both ? (periodScopeLabel([...techPro]) ?? '') : '',
  };
}

/**
 * Nom du congé tel qu'il est enregistré. Les vacances diffèrent d'un ordre à
 * l'autre : leur nom dit qui elles concernent. Les jours fériés, eux, valent
 * pour tout le monde et gardent leur nom.
 */
export function officialBreakName(base: string, kind: OfficialBreak['kind'], suffix: string): string {
  return kind === 'VACATION' && suffix ? `${base} (${suffix})` : base;
}
