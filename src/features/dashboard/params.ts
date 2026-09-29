import { mergeQuery } from '@/lib/query/list';
import type { RangeKey } from './time';

/**
 * Etat de l'ecran dans l'URL (panneau ouvert, periodes choisies) : l'ecran reste
 * un composant serveur, un lien suffit pour ouvrir un detail, et le rafraichissement
 * en direct ne referme rien.
 */
export type Panel = 'calls' | 'pres' | 'abs' | 'ret' | 'noc' | 'teacher';
export type CallsTab = 'done' | 'missed' | 'now' | 'next';
export type TopRange = 'd' | 'w' | 'm';
export type WatchRange = 'w7' | 'm' | 't' | 'y';

export type DashParams = {
  panel: Panel | null;
  /** Enseignant dont le detail est ouvert (panel = teacher). */
  tid: string | null;
  callsTab: CallsTab;
  top: TopRange;
  /** Periode du detail d'un enseignant. */
  tp: RangeKey;
  watch: WatchRange;
  /** « Voir plus » deplie (enseignants sans moyennes terminees). */
  more: boolean;
};

const PANELS: readonly Panel[] = ['calls', 'pres', 'abs', 'ret', 'noc', 'teacher'];
const TABS: readonly CallsTab[] = ['done', 'missed', 'now', 'next'];
const TOPS: readonly TopRange[] = ['d', 'w', 'm'];
const WATCHES: readonly WatchRange[] = ['w7', 'm', 't', 'y'];
const TEACHER_RANGES: readonly RangeKey[] = ['d', 'w', 'm', 't1', 't2', 't3', 'y'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pick = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined, fallback: T): T => (list.find((x) => x === v) ?? fallback);

export function parseDashParams(sp: Record<string, string | string[] | undefined>): DashParams {
  const tid = pick(sp.tid);
  const panel = PANELS.find((p) => p === pick(sp.panel)) ?? null;
  return {
    // Un detail d'enseignant sans identifiant valide n'ouvre rien.
    panel: panel === 'teacher' && !(tid && UUID.test(tid)) ? null : panel,
    tid: tid && UUID.test(tid) ? tid : null,
    callsTab: oneOf(TABS, pick(sp.ptab), 'done'),
    top: oneOf(TOPS, pick(sp.top), 'd'),
    tp: oneOf(TEACHER_RANGES, pick(sp.tp), 'd'),
    watch: oneOf(WATCHES, pick(sp.watch), 'w7'),
    more: pick(sp.more) === '1',
  };
}

/** Parametres d'URL propres a l'ecran (les autres, ex. messages flash, sont ignores). */
const KEYS = ['panel', 'tid', 'ptab', 'top', 'tp', 'watch', 'more'] as const;

/** Lien du tableau de bord avec des surcharges ; `null` retire un parametre. */
export function dashHref(base: string, sp: Record<string, string | string[] | undefined>, overrides: Record<string, string | null>): string {
  const kept: Record<string, string | string[] | undefined> = {};
  for (const k of KEYS) if (sp[k] !== undefined) kept[k] = sp[k];
  return `${base}${mergeQuery(kept, overrides)}`;
}

/** Lien qui referme le panneau (garde les choix de periode). */
export function closeHref(base: string, sp: Record<string, string | string[] | undefined>): string {
  return dashHref(base, sp, { panel: null, tid: null, ptab: null, tp: null });
}
