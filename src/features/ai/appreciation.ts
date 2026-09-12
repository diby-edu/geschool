import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';
import { getBulletin } from '@/features/bulletins/queries';
import { ruleBasedAppreciation } from '@/lib/ai/rule-based';
import { aiConfigured, anthropicComplete } from '@/lib/ai/anthropic';
import type { AiText, AppreciationInput } from '@/lib/ai/types';

const PASSING_DEFAULT = 10;

/**
 * Propose une appréciation pour un bulletin (lot 13).
 *
 * Contrainte absolue (IMPLEMENTATION_PLAN §13) : l'IA n'opère QUE sur des
 * données déjà retournées à l'utilisateur par une requête autorisée. Ici, le
 * bulletin est chargé via getBulletin sous l'identité de l'appelant (RLS) ; rien
 * d'autre n'est transmis. Aucun service_role, aucun accès direct à la base.
 *
 * Sans clé LLM configurée, la proposition est générée par des règles
 * déterministes (aucun appel externe). Avec une clé, le LLM est utilisé et
 * l'on retombe sur les règles en cas d'échec.
 */
export async function suggestAppreciation(ctx: TenantContext, bulletinId: string): Promise<AiText> {
  requireWritable(ctx, 'reports.validate');
  const b = await getBulletin(ctx, bulletinId);
  if (!b) throw new NotFoundError('Bulletin introuvable.');

  const input: AppreciationInput = {
    studentName: b.student,
    generalAverage: b.general_average,
    classAverage: b.class_average,
    rank: b.rank,
    classSize: b.class_size,
    passingScore: PASSING_DEFAULT,
    absences: b.absences,
    lateness: b.lateness,
    subjects: b.items.map((it) => ({ name: it.subject, average: it.average, classAverage: it.class_average })),
  };

  const ruleText = ruleBasedAppreciation(input);

  if (aiConfigured()) {
    try {
      const system =
        "Tu es un professeur principal en Côte d'Ivoire. Rédige une appréciation de bulletin en français, " +
        'bienveillante, concise (2 à 4 phrases), factuelle, sans invial ni donnée non fournie. ' +
        'Ne mentionne que les éléments présents dans les données.';
      const user = `Données de l'élève (déjà anonymisées côté établissement) :\n${JSON.stringify(input, null, 2)}\n\nRédige l'appréciation.`;
      const text = await anthropicComplete(system, user);
      await audit(ctx, { action: 'ai.appreciation', module: 'ai', entityType: 'report_card', entityId: bulletinId, after: { source: 'ai' } });
      return { text, source: 'ai' };
    } catch {
      // Repli déterministe : la fonctionnalité ne casse jamais.
    }
  }

  await audit(ctx, { action: 'ai.appreciation', module: 'ai', entityType: 'report_card', entityId: bulletinId, after: { source: 'rule' } });
  return { text: ruleText, source: 'rule' };
}

/** Enregistre l'appréciation retenue sur le bulletin (RLS : reports.validate). */
export async function saveAppreciation(ctx: TenantContext, bulletinId: string, text: string): Promise<void> {
  requireWritable(ctx, 'reports.validate');
  const supabase = await createClient();
  const clean = text.trim().slice(0, 2000);
  const { error, count } = await supabase
    .from('report_cards')
    .update({ head_teacher_comment: clean || null }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', bulletinId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Bulletin introuvable.');
  await audit(ctx, { action: 'ai.appreciation_save', module: 'ai', entityType: 'report_card', entityId: bulletinId });
}
