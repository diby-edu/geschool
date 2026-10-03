'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { writeReportingSettings } from './settings';
import { writeTemplate, resetTemplate } from './template-service';
import {
  BLOCK_IDS,
  COLUMN_IDS,
  templateProblem,
  type BlockId,
  type BulletinTemplate,
  type ColumnId,
} from './template';
import {
  DECISION_CODES,
  DISTINCTION_CODES,
  TIER_TONES,
  presetWeights,
  tiersProblem,
  type DecisionCode,
  type DecisionOption,
  type DistinctionCode,
  type MentionTier,
  type PeriodWeights,
  type Tier,
  type TierTone,
} from './config';

/**
 * Enregistrement des règles d'écriture des bulletins.
 *
 * Chaque formulaire envoie ses lignes en colonnes parallèles (`min`, `label`,
 * `tone`…) : c'est ce que produit un tableau de champs répétés, et cela
 * fonctionne sans JavaScript.
 */

const scaleMax = 20;

const readTiers = (fd: FormData): Tier[] => readTiersWithIndex(fd).map((x) => x.tier);

function readMentions(fd: FormData): MentionTier[] {
  const codes = fd.getAll('code');
  return readTiersWithIndex(fd).map(({ tier, index }) => ({
    ...tier,
    code: DISTINCTION_CODES.includes(String(codes[index]) as DistinctionCode)
      ? (String(codes[index]) as DistinctionCode)
      : 'NONE',
  }));
}

/**
 * Les lignes d'un tableau de paliers, en gardant la position d'origine de
 * chacune — les mentions ont une colonne de plus à recoller.
 *
 * Une ligne dont le mot est vidé est une ligne SUPPRIMÉE : effacer le texte
 * suffit, personne n'a à chercher un bouton « retirer ».
 */
function readTiersWithIndex(fd: FormData): { tier: Tier; index: number }[] {
  const mins = fd.getAll('min');
  const labels = fd.getAll('label');
  const tones = fd.getAll('tone');
  const out: { tier: Tier; index: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i] ?? '').trim();
    if (!label) continue;
    const min = Number(String(mins[i] ?? '').replace(',', '.'));
    const tone = TIER_TONES.includes(String(tones[i]) as TierTone) ? (String(tones[i]) as TierTone) : 'neutral';
    out.push({ tier: { min, label, tone }, index: i });
  }
  return out;
}

export async function saveSubjectTiersAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const tiers = readTiers(fd);
    const problem = tiersProblem(tiers, scaleMax);
    if (problem) throw new ValidationError(problem);
    await writeReportingSettings(ctx, { subjectTiers: tiers });
    redirect(`/e/${slug}/bulletins/config?enregistre=matieres`);
  });
}

export async function saveMentionsAction(
  slug: string,
  which: 'term' | 'year',
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const mentions = readMentions(fd);
    const problem = tiersProblem(mentions, scaleMax);
    if (problem) throw new ValidationError(problem);
    await writeReportingSettings(
      ctx,
      which === 'term' ? { termMentions: mentions } : { yearMentions: mentions },
    );
    redirect(`/e/${slug}/bulletins/config?enregistre=${which === 'term' ? 'mentions' : 'annee'}`);
  });
}

export async function saveDecisionsAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const codes = fd.getAll('code');
    const labels = fd.getAll('label');
    const mins = fd.getAll('min');
    const out: DecisionOption[] = [];
    for (let i = 0; i < labels.length; i++) {
      const label = String(labels[i] ?? '').trim();
      if (!label) continue;
      const code = String(codes[i] ?? '');
      if (!DECISION_CODES.includes(code as DecisionCode)) continue;
      const raw = String(mins[i] ?? '').replace(',', '.').trim();
      const min = raw === '' ? null : Number(raw);
      if (min !== null && (!Number.isFinite(min) || min < 0 || min > scaleMax)) {
        throw new ValidationError(`Le seuil de « ${label} » doit être compris entre 0 et ${scaleMax}, ou rester vide.`);
      }
      out.push({ code: code as DecisionCode, label, min });
    }
    if (out.length === 0) throw new ValidationError('Il faut au moins une décision possible.');
    if (!out.some((d) => d.code === 'PROMOTED')) {
      throw new ValidationError('Gardez au moins une décision de passage : sans elle, aucun élève ne pourrait monter de classe.');
    }
    await writeReportingSettings(ctx, { decisions: out });
    redirect(`/e/${slug}/bulletins/config?enregistre=decisions`);
  });
}

export async function savePeriodWeightsAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const preset = String(fd.get('preset') ?? 'CUSTOM');
    const count = Math.max(1, Math.min(12, Number(fd.get('periodCount') ?? 3) || 3));

    let weights: PeriodWeights;
    if (preset === 'EQUAL' || preset === 'FIRST_HALF') {
      weights = presetWeights(preset, count);
    } else {
      weights = {};
      for (let i = 1; i <= count; i++) {
        const raw = String(fd.get(`weight-${i}`) ?? '').replace(',', '.').trim();
        const w = Number(raw);
        if (!Number.isFinite(w) || w <= 0) {
          throw new ValidationError(
            `Le coefficient de la période ${i} doit être supérieur à 0 : à zéro, cette période disparaîtrait de la moyenne annuelle.`,
          );
        }
        if (w > 10) throw new ValidationError('Un coefficient de période au-delà de 10 n’a pas de sens.');
        weights[String(i)] = w;
      }
    }
    await writeReportingSettings(ctx, { periodWeights: weights });
    redirect(`/e/${slug}/bulletins/config?enregistre=coefficients`);
  });
}

// -----------------------------------------------------------------------------
// Le modèle de bulletin
// -----------------------------------------------------------------------------

export async function saveTemplateAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const texte = (k: string, max = 240) => String(fd.get(k) ?? '').trim().slice(0, max);
    const liste = (k: string) =>
      String(fd.get(k) ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const patch: BulletinTemplate = {
      headerLines: liste('headerLines').slice(0, 5),
      title: texte('title', 80),
      showLogo: fd.get('showLogo') === 'on',
      blocks: fd.getAll('blocks').map(String).filter((b): b is BlockId => BLOCK_IDS.includes(b as BlockId)),
      columns: fd.getAll('columns').map(String).filter((c): c is ColumnId => COLUMN_IDS.includes(c as ColumnId)),
      signatures: liste('signatures').slice(0, 4),
      footerLeft: texte('footerLeft'),
      footerRight: texte('footerRight'),
      accent: /^#[0-9a-fA-F]{6}$/.test(texte('accent', 7)) ? texte('accent', 7) : null,
      density: fd.get('density') === 'COMPACT' ? 'COMPACT' : 'NORMAL',
    };

    const probleme = templateProblem(patch);
    if (probleme) throw new ValidationError(probleme);
    await writeTemplate(ctx, patch);
    redirect(`/e/${slug}/bulletins/modele?enregistre=1`);
  });
}

export async function resetTemplateAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await resetTemplate(ctx);
    redirect(`/e/${slug}/bulletins/modele?reinitialise=1`);
  });
}
