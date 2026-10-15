import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { weightOf, type PeriodWeights } from './config';
import type { GradingPeriod } from './periods';
import { annualFrom, type NewcomerAnnualMode } from './annual-core';
import { previousSchoolAverages } from './previous-school';

/**
 * La moyenne de l'année, et le rang qui va avec.
 *
 * Elle ne se recalcule PAS à partir des notes : elle se compose des moyennes
 * déjà imprimées sur les bulletins des périodes précédentes. C'est la seule
 * façon qu'un bulletin remis à une famille en décembre reste cohérent avec le
 * bulletin de juin — une note corrigée après coup ne doit pas faire mentir un
 * document déjà signé.
 */

export type AnnualResult = {
  averages: Map<string, number | null>;
  ranks: Map<string, number>;
  /** Périodes dont AUCUN bulletin n'existe pour les élèves de cette classe : on refuse alors de conclure. */
  missingPeriods: string[];
};

export async function annualAverages(
  ctx: TenantContext,
  previous: GradingPeriod[],
  currentSequence: number,
  currentAverages: Map<string, number | null>,
  weights: PeriodWeights,
  round: (n: number) => number,
  mode: NewcomerAnnualMode = 'ATTENDED',
): Promise<AnnualResult> {
  const supabase = await createClient();
  const external =
    mode === 'PREVIOUS_SCHOOL'
      ? await previousSchoolAverages(ctx, [...currentAverages.keys()], previous.map((p) => p.id))
      : new Map<string, { average: number; school: string | null }>();

  type Row = { id: string; student_id: string; academic_period_id: string; general_average: number | null };
  // Les bulletins précédents se cherchent par ÉLÈVE, pas par classe : un élève
  // passé de la 4e A à la 4e B en cours d'année a son bulletin du 1er trimestre
  // dans l'ancienne classe. Le chercher dans la classe actuelle le privait de
  // moyenne annuelle, de rang annuel et de décision proposée.
  const studentIds = [...currentAverages.keys()];
  const rows: Row[] = [];
  if (previous.length > 0) {
    for (let i = 0; i < studentIds.length; i += 100) {
      const batch = studentIds.slice(i, i + 100);
      const part = await fetchAllRows<Row>((cursor) => {
        let q = supabase
          .from('report_cards')
          .select('id, student_id, academic_period_id, general_average')
          .eq('school_id', ctx.school.id)
          .in('student_id', batch)
          .in(
            'academic_period_id',
            previous.map((p) => p.id),
          )
          .order('id')
          .limit(500);
        if (cursor) q = q.gt('id', cursor);
        return q as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
      }, 500);
      rows.push(...part);
    }
  }

  // Une période dont pas un seul bulletin n'a été généré n'est pas un élève
  // absent : c'est une étape sautée. On le dit au lieu de calculer une moyenne
  // annuelle amputée d'un trimestre.
  const vues = new Set(rows.map((r) => r.academic_period_id));
  const missingPeriods = previous.filter((p) => !vues.has(p.id)).map((p) => p.name);

  const parEleve = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    const m = parEleve.get(r.student_id) ?? new Map<string, number | null>();
    m.set(r.academic_period_id, r.general_average === null ? null : Number(r.general_average));
    parEleve.set(r.student_id, m);
  }

  const averages = new Map<string, number | null>();
  for (const [studentId, courante] of currentAverages) {
    const deja = parEleve.get(studentId);
    // Élève arrivé en cours d'année : l'établissement choisit (0114) de
    // calculer sur les périodes faites chez lui, ou avec les moyennes de
    // l'ancienne école. Même règle que la matrice du conseil (annual-core).
    averages.set(
      studentId,
      annualFrom(
        previous.map((p) => ({
          value: deja?.get(p.id) ?? null,
          previousSchool: external.get(`${studentId}:${p.id}`)?.average ?? null,
          weight: weightOf(weights, p.sequence),
        })),
        { value: courante, weight: weightOf(weights, currentSequence) },
        mode,
        round,
      ),
    );
  }

  // Le rang annuel, ex æquo compris. Un élève sans moyenne n'est pas classé.
  const classables = [...averages.entries()]
    .filter((e): e is [string, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  classables.forEach(([id, valeur], i) => {
    const precedent = i > 0 ? classables[i - 1]! : null;
    ranks.set(id, precedent && precedent[1] === valeur ? ranks.get(precedent[0])! : i + 1);
  });

  return { averages, ranks, missingPeriods };
}

/**
 * L'arrondi du barème de l'établissement, appliqué UNE SEULE FOIS, à la fin.
 * Arrondir chaque période avant de les combiner déplacerait la moyenne annuelle.
 */
export function rounder(decimals: number, rounding: string): (n: number) => number {
  const f = 10 ** Math.max(0, Math.min(6, decimals));
  return (n: number) => {
    const x = n * f;
    switch (rounding) {
      case 'DOWN':
        return Math.trunc(x) / f;
      case 'UP':
        return (x < 0 ? Math.floor(x) : Math.ceil(x)) / f;
      case 'HALF_DOWN':
        return (Math.abs(x % 1) === 0.5 ? Math.trunc(x) : Math.round(x)) / f;
      case 'HALF_EVEN': {
        const bas = Math.floor(x);
        if (Math.abs(x % 1) !== 0.5) return Math.round(x) / f;
        return (bas % 2 === 0 ? bas : bas + 1) / f;
      }
      default:
        // HALF_UP : la règle scolaire courante, et le défaut du barème.
        return (x < 0 ? -Math.round(-x) : Math.round(x)) / f;
    }
  };
}
