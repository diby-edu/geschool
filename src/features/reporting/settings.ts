import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import {
  DEFAULT_DECISIONS,
  DEFAULT_SUBJECT_TIERS,
  DEFAULT_TERM_MENTIONS,
  DEFAULT_YEAR_MENTIONS,
  DECISION_CODES,
  DISTINCTION_CODES,
  TIER_TONES,
  presetWeights,
  type DecisionCode,
  type DecisionOption,
  type DistinctionCode,
  type MentionTier,
  type PeriodWeights,
  type Tier,
  type TierTone,
} from './config';

/**
 * Les règles d'écriture des bulletins de l'établissement.
 *
 * Rangées dans `school_settings` / espace `reporting`. Rien n'est figé dans le
 * code : une école qui n'a jamais ouvert l'écran reçoit les jeux par défaut,
 * une autre peut tout réécrire, y compris le nombre de paliers.
 *
 * Tout ce qui sort d'ici est RELU et NETTOYÉ : ces objets viennent d'une colonne
 * JSON, donc de n'importe quoi. Un réglage abîmé retombe sur le défaut plutôt
 * que de faire tomber la génération des bulletins.
 */

export type ReportingSettings = {
  subjectTiers: Tier[];
  termMentions: MentionTier[];
  yearMentions: MentionTier[];
  decisions: DecisionOption[];
  /** Poids de chaque période, par rang : { "1": 1, "2": 2, "3": 2 }. */
  periodWeights: PeriodWeights;
};

export async function readReportingSettings(ctx: TenantContext): Promise<ReportingSettings> {
  const s = await readSettings(ctx, 'reporting');
  return {
    subjectTiers: cleanTiers(s.subjectTiers, DEFAULT_SUBJECT_TIERS),
    termMentions: cleanMentions(s.termMentions, DEFAULT_TERM_MENTIONS),
    yearMentions: cleanMentions(s.yearMentions, DEFAULT_YEAR_MENTIONS),
    decisions: cleanDecisions(s.decisions, DEFAULT_DECISIONS),
    periodWeights: cleanWeights(s.periodWeights),
  };
}

export async function writeReportingSettings(ctx: TenantContext, patch: Partial<ReportingSettings>): Promise<void> {
  await writeSettings(ctx, 'reporting', patch as Record<string, unknown>);
}

// -----------------------------------------------------------------------------
// Nettoyage — ce qui vient du JSON n'est jamais cru sur parole.
// -----------------------------------------------------------------------------

const asList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

const asNumber = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asLabel = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s.slice(0, 120) : null;
};

const asTone = (v: unknown): TierTone => (TIER_TONES.includes(v as TierTone) ? (v as TierTone) : 'neutral');

function cleanTiers(raw: unknown, fallback: Tier[]): Tier[] {
  const out: Tier[] = [];
  for (const t of asList(raw)) {
    const min = asNumber(t.min);
    const label = asLabel(t.label);
    if (min === null || min < 0 || label === null) continue;
    out.push({ min, label, tone: asTone(t.tone) });
  }
  return out.length > 0 ? sortDown(out) : fallback;
}

function cleanMentions(raw: unknown, fallback: MentionTier[]): MentionTier[] {
  const out: MentionTier[] = [];
  for (const t of asList(raw)) {
    const min = asNumber(t.min);
    const label = asLabel(t.label);
    if (min === null || min < 0 || label === null) continue;
    const code = DISTINCTION_CODES.includes(t.code as DistinctionCode) ? (t.code as DistinctionCode) : 'NONE';
    out.push({ min, label, tone: asTone(t.tone), code });
  }
  return out.length > 0 ? sortDown(out) : fallback;
}

function cleanDecisions(raw: unknown, fallback: DecisionOption[]): DecisionOption[] {
  const out: DecisionOption[] = [];
  for (const d of asList(raw)) {
    const label = asLabel(d.label);
    if (label === null) continue;
    if (!DECISION_CODES.includes(d.code as DecisionCode)) continue;
    const min = asNumber(d.min);
    out.push({ code: d.code as DecisionCode, label, min: min === null || min < 0 ? null : min });
  }
  return out.length > 0 ? out : fallback;
}

function cleanWeights(raw: unknown): PeriodWeights {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return presetWeights('EQUAL', 3);
  const out: PeriodWeights = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const rank = Number(k);
    const w = asNumber(v);
    // Un poids nul effacerait une période entière de la moyenne annuelle.
    if (!Number.isInteger(rank) || rank < 1 || rank > 12) continue;
    if (w === null || w <= 0 || w > 10) continue;
    out[String(rank)] = w;
  }
  return Object.keys(out).length > 0 ? out : presetWeights('EQUAL', 3);
}

function sortDown<T extends Tier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => b.min - a.min);
}
