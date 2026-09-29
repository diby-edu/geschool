/**
 * Volume horaire hebdomadaire : saisi en HEURES, stocké en minutes.
 *
 * La base garde des minutes (`level_subjects.weekly_minutes`), parce que
 * certaines matières pèsent 1 h 30. Mais personne ne raisonne en minutes : un
 * directeur dit « le français, c'est 5 heures en 6ème ». On saisit donc « 5 »,
 * « 1,5 » ou « 1h30 », et l'affichage rend « 5h » et « 1h30 ».
 */

/** 300 → « 5h », 90 → « 1h30 », 45 → « 45min », 0 → « — ». */
export function formatHours(minutes: number): string {
  if (!minutes || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Ce qu'on met dans le champ de saisie : « 5 », « 1,5 », vide si aucun volume. */
export function hoursValue(minutes: number): string {
  if (!minutes || minutes < 0) return '';
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100).replace('.', ',');
}

/** « 5 », « 1,5 », « 1h30 », « 90min » → minutes. Vide ou incompréhensible → 0. */
export function parseHours(raw: string): number {
  const v = raw.trim().toLowerCase().replace(',', '.');
  if (!v) return 0;

  const min = /^(\d+(?:\.\d+)?)\s*(?:min|m)$/.exec(v);
  if (min) return clamp(Math.round(Number(min[1])));

  const hm = /^(\d+)\s*h\s*(\d{1,2})?$/.exec(v);
  if (hm) return clamp(Number(hm[1]) * 60 + Number(hm[2] ?? 0));

  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return clamp(Math.round(n * 60));
}

/** Le schéma de la base plafonne à 3000 minutes (50 h), largement au-delà d'une semaine de cours. */
const clamp = (m: number) => Math.min(Math.max(m, 0), 3000);

/* --------------------------------------------------------------------------
   Séances
   --------------------------------------------------------------------------
   Un directeur ne dit pas « 4h35 de français », il dit « cinq heures de
   français » — c'est-à-dire cinq SÉANCES. La base garde des minutes parce que
   l'emploi du temps en a besoin ; l'écran, lui, compte des séances, et la durée
   d'une séance est celle des créneaux de l'établissement (55 min, 60 min…).
   -------------------------------------------------------------------------- */

/** Minutes stockées -> nombre de séances affiché. */
export function toSessions(minutes: number, sessionMinutes: number): number {
  if (!minutes || minutes <= 0 || sessionMinutes <= 0) return 0;
  return Math.max(1, Math.round(minutes / sessionMinutes));
}

/** Ce qu'on met dans le champ : le nombre de séances, vide s'il n'y en a pas. */
export function sessionsValue(minutes: number, sessionMinutes: number): string {
  const n = toSessions(minutes, sessionMinutes);
  return n > 0 ? String(n) : '';
}

/** Saisie -> minutes à stocker. « 5 » avec des créneaux de 55 min donne 275. */
export function minutesFromSessions(raw: string, sessionMinutes: number): number {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp(Math.round(n) * sessionMinutes);
}
