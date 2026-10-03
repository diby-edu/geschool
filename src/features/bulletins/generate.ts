import 'server-only';
import { classTrack } from '@/features/evaluations/refs';
import { gradingParams, rpcArgs, subjectArgs } from '@/features/evaluations/scale';
import { readReportingSettings } from '@/features/reporting/settings';
import { listGradingPeriods, isLastPeriod, periodsBefore } from '@/features/reporting/periods';
import { annualAverages, rounder } from '@/features/reporting/annual';
import { fillDecisionLabel, suggestDecision, tierFor } from '@/features/reporting/config';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { fetchAllRows } from '@/lib/supabase/pagination';

export type GenerateResult = { generated: number };

/**
 * Génère (ou régénère) les bulletins d'une classe pour une période.
 *
 * Tout est calculé à partir des notes clôturées/publiées (fonctions SQL 0022 /
 * 0037), puis FIGÉ dans report_cards + report_card_items : le bulletin est un
 * instantané qui survit au renommage d'une matière ou au départ d'un enseignant
 * (docs/DATABASE.md §23). Régénérer un bulletin VALIDÉ ou PUBLIÉ est refusé.
 */
export async function generateForClass(ctx: TenantContext, classId: string, periodId: string): Promise<GenerateResult> {
  requireWritable(ctx, 'reports.generate');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;

  const { data: klass } = await supabase
    .from('classes')
    .select('id, name, level_id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!klass) throw new NotFoundError('Classe introuvable.');

  const { data: period } = await supabase
    .from('academic_periods')
    .select('id, name, starts_on, ends_on, tracks')
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .maybeSingle();
  if (!period) throw new NotFoundError('Période introuvable.');

  // Un bulletin ne mélange jamais deux ordres d'enseignement : il suit sa classe.
  // Une classe du technique se voit en semestres, jamais en trimestres.
  const track = await classTrack(ctx, classId);
  const scope = (period as { tracks?: string[] | null }).tracks ?? null;
  if (scope !== null && !scope.includes(track)) {
    throw new ValidationError(
      `« ${period.name} » ne concerne pas cette classe : elle suit le découpage de son ordre d'enseignement.`,
    );
  }

  // Refuser de régénérer par-dessus des bulletins déjà validés/publiés.
  const { data: locked } = await supabase
    .from('report_cards')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('academic_period_id', periodId)
    .eq('class_id', classId)
    .in('status', ['VALIDATED', 'PUBLISHED'])
    .limit(1);
  if (locked && locked.length > 0) {
    throw new ValidationError('Des bulletins de cette classe sont déjà validés ou publiés. Impossible de régénérer.');
  }

  // Programme de la classe : matières + coefficients du niveau.
  const { data: ls } = await supabase
    .from('level_subjects')
    .select('subject_id, coefficient, is_mandatory, subjects(name)')
    .eq('school_id', ctx.school.id)
    .eq('level_id', klass.level_id);
  const subjects = (
    (ls ?? []) as unknown as { subject_id: string; coefficient: number; is_mandatory: boolean; subjects: { name: string } | null }[]
  ).map((r) => ({
    id: r.subject_id,
    coefficient: Number(r.coefficient),
    name: r.subjects?.name ?? 'Matière',
    optional: !r.is_mandatory,
  }));
  // Sans programme de niveau, il n'y a ni coefficient ni moyenne generale : le
  // bulletin serait imprime vide, avec un rang identique pour tous. On refuse,
  // en disant ou aller le saisir.
  if (subjects.length === 0) {
    throw new ValidationError(
      `Le programme du niveau de « ${klass.name} » n'est pas saisi : aucune matière, aucun coefficient. ` +
        'Renseignez « Matières par niveau » avant de générer les bulletins.',
    );
  }

  // Élèves inscrits.
  const { data: enr } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('status', 'ENROLLED');
  const studentIds = (enr ?? []).map((e) => e.student_id);
  if (studentIds.length === 0) throw new ValidationError('Aucun élève inscrit dans cette classe.');

  // Classement général (moyenne générale, rang, effectif).
  // Bareme de l'etablissement (maximum, decimales, arrondi, absences).
  const params = await gradingParams(ctx);
  const { data: rankData, error: rankErr } = await supabase.rpc('class_period_ranking' as never, {
    p_class: classId,
    p_period: periodId,
    ...rpcArgs(params),
  } as never);
  // Sans ce controle, un calcul qui echoue produisait 50 bulletins vides, sans
  // une moyenne, sans un rang — et sans le moindre message. Un bulletin faux
  // est pire qu'un bulletin refuse.
  if (rankErr) throw new Error(`Calcul des moyennes generales impossible : ${rankErr.message}`);
  const ranking = new Map(
    ((rankData ?? []) as unknown as { student_id: string; general_average: number | null; rank_position: number | null; class_size: number }[])
      .map((r) => [r.student_id, r]),
  );
  const generalAverages = [...ranking.values()].map((r) => r.general_average).filter((a): a is number => a !== null).map(Number);
  const classGeneralAvg = generalAverages.length > 0 ? round2(generalAverages.reduce((a, b) => a + b, 0) / generalAverages.length) : null;
  const classSize = [...ranking.values()][0]?.class_size ?? studentIds.length;

  // Moyennes par matière pour toute la classe (une requête par matière).
  type SubjStat = { average: Map<string, number | null>; classAvg: number | null; min: number | null; max: number | null; rank: Map<string, number> };
  const subjStats = new Map<string, SubjStat>();
  for (const s of subjects) {
    const { data: rows, error: subjErr } = await supabase.rpc('class_subject_averages' as never, {
      p_class: classId,
      p_period: periodId,
      p_subject: s.id,
      ...subjectArgs(params),
    } as never);
    if (subjErr) throw new Error(`Calcul des moyennes de « ${s.name} » impossible : ${subjErr.message}`);
    const list = ((rows ?? []) as unknown as { student_id: string; average: number | null }[]).map((r) => ({ student_id: r.student_id, average: r.average === null ? null : Number(r.average) }));
    const avgMap = new Map(list.map((r) => [r.student_id, r.average]));
    const values = list.map((r) => r.average).filter((a): a is number => a !== null);
    const classAvg = values.length > 0 ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null;
    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 0 ? Math.max(...values) : null;
    // Rang par matière (ex æquo usuel).
    const sorted = [...list].filter((r) => r.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
    const rankMap = new Map<string, number>();
    sorted.forEach((r, i) => {
      const prev = i > 0 ? sorted[i - 1]! : null;
      rankMap.set(r.student_id, prev && prev.average === r.average ? rankMap.get(prev.student_id)! : i + 1);
    });
    subjStats.set(s.id, { average: avgMap, classAvg, min, max, rank: rankMap });
  }

  // Absences / retards de la période (une requête, tally en mémoire).
  const { absences, lateness } = await countAttendance(ctx, studentIds, period.starts_on, period.ends_on);

  // Les règles d'écriture de l'établissement : appréciations, mentions,
  // décisions, coefficients de période. Rien n'est écrit à la main.
  const reporting = await readReportingSettings(ctx);
  const round = rounder(params.decimals, params.rounding);

  // Qui enseigne quoi dans cette classe : le nom est FIGÉ sur le bulletin, il
  // doit rester lisible même si l'enseignant quitte l'établissement.
  const teacherBySubject = await teachersOfClass(ctx, classId, yearId);

  // La dernière période de l'année porte, elle seule, la moyenne annuelle, la
  // mention de l'année et la décision de passage. Aucun réglage : c'est le rang
  // le plus haut dans l'ordre d'enseignement de la classe.
  const gradingPeriods = await listGradingPeriods(ctx, yearId);
  const isLast = isLastPeriod(gradingPeriods, track, periodId);
  const previousPeriods = periodsBefore(gradingPeriods, track, periodId);
  const currentSequence = gradingPeriods.find((p) => p.id === periodId)?.sequence ?? 1;

  const annual = isLast
    ? await annualAverages(
        ctx,
        classId,
        previousPeriods,
        currentSequence,
        new Map([...ranking].map(([id, r]) => [id, r.general_average === null ? null : Number(r.general_average)])),
        reporting.periodWeights,
        round,
      )
    : null;

  if (annual && annual.missingPeriods.length > 0) {
    throw new ValidationError(
      `Ce bulletin clôt l'année : il porte la moyenne annuelle et la décision du conseil. ` +
        `Or aucun bulletin n'a été généré pour ${annual.missingPeriods.join(', ')}. ` +
        'Générez-les d’abord, sinon la moyenne annuelle serait amputée d’une période.',
    );
  }

  const nextLevel = isLast ? await nextLevelName(ctx, klass.level_id) : null;

  // Snapshot par élève.
  let generated = 0;
  for (const studentId of studentIds) {
    const r = ranking.get(studentId);
    const generalAverage = r?.general_average === null || r?.general_average === undefined ? null : Number(r.general_average);

    // La mention de la période : un palier, jamais une phrase choisie.
    const mention = tierFor(reporting.termMentions, generalAverage);

    // Le bilan de l'année, sur le dernier bulletin seulement.
    const annualAverage = annual?.averages.get(studentId) ?? null;
    const yearMention = isLast ? tierFor(reporting.yearMentions, annualAverage) : null;
    const decision = isLast ? suggestDecision(reporting.decisions, annualAverage) : null;

    const { data: card, error: cardErr } = await supabase
      .from('report_cards')
      .upsert(
        {
          school_id: ctx.school.id,
          academic_year_id: yearId,
          academic_period_id: periodId,
          student_id: studentId,
          class_id: classId,
          status: 'GENERATED',
          general_average: r?.general_average ?? null,
          rank: r?.rank_position ?? null,
          class_size: classSize,
          class_average: classGeneralAvg,
          // La mention de l'année remplace celle de la période sur le dernier
          // bulletin : c'est le bilan qui compte, pas le dernier trimestre.
          distinction: (yearMention ?? mention)?.code ?? 'NONE',
          distinction_label: (yearMention ?? mention)?.label ?? null,
          annual_average: annualAverage,
          annual_rank: annual?.ranks.get(studentId) ?? null,
          // Une PROPOSITION : le conseil de classe reste souverain et peut en
          // changer avant de valider.
          decision: decision?.code ?? null,
          decision_label: decision ? fillDecisionLabel(decision.label, klass.name, nextLevel) : null,
          absences_count: absences.get(studentId) ?? 0,
          lateness_count: lateness.get(studentId) ?? 0,
          generated_at: new Date().toISOString(),
          // Un bulletin regenere doit etre revalide puis resigne.
          signed_at: null,
          signed_by: null,
        } satisfies TablesInsert<'report_cards'>,
        { onConflict: 'student_id,academic_period_id' },
      )
      .select('id')
      .single();
    if (cardErr) throw cardErr;

    // Remplacer les lignes de matière.
    await supabase.from('report_card_items').delete().eq('school_id', ctx.school.id).eq('report_card_id', card.id);
    const items: TablesInsert<'report_card_items'>[] = subjects.map((s, i) => {
      const st = subjStats.get(s.id)!;
      const avg = st.average.get(studentId) ?? null;
      return {
        school_id: ctx.school.id,
        report_card_id: card.id,
        subject_id: s.id,
        subject_name_snapshot: s.name,
        teacher_name_snapshot: teacherBySubject.get(s.id) ?? null,
        coefficient: s.coefficient,
        average: avg,
        // Le mot de la colonne « Appréciation » : le palier de la moyenne de
        // la matière, selon les seuils de l'établissement.
        appreciation: tierFor(reporting.subjectTiers, avg)?.label ?? null,
        // Une matière facultative qui n'entre pas dans la moyenne générale
        // (réglage « bonus » ou « hors moyenne ») ne porte pas de points : sa
        // note reste affichée, mais elle ne s'ajoute pas au total. En « elle
        // compte comme les autres », rien ne change.
        weighted_points:
          avg === null || (s.optional && params.optionalMode !== 'COUNT') ? null : round2(avg * s.coefficient),
        class_average: st.classAvg,
        class_min: st.min,
        class_max: st.max,
        rank: st.rank.get(studentId) ?? null,
        sequence: i,
      };
    });
    if (items.length > 0) await supabase.from('report_card_items').insert(items);
    generated++;
  }

  await audit(ctx, { action: 'reports.generate', module: 'reports', entityType: 'report_card', after: { classId, periodId, generated } });
  return { generated };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Qui enseigne quelle matière dans cette classe, sous la forme imprimée sur le
 * bulletin. Le nom est FIGÉ à la génération : un enseignant qui part en cours
 * d'année reste celui qui a noté ce trimestre-là.
 */
async function teachersOfClass(ctx: TenantContext, classId: string, yearId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teaching_assignments')
    .select('subject_id, teachers(first_name, last_name, gender)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_year_id', yearId);

  const out = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    subject_id: string | null;
    teachers: { first_name: string; last_name: string; gender: string | null } | null;
  }[]) {
    if (!row.subject_id || !row.teachers) continue;
    // Une matière peut avoir plusieurs affectations (groupes) : la première
    // suffit, la colonne du bulletin ne porte qu'un nom.
    if (out.has(row.subject_id)) continue;
    const t = row.teachers;
    const civilite = t.gender === 'FEMALE' ? 'Mme' : t.gender === 'MALE' ? 'M.' : '';
    out.set(row.subject_id, `${civilite} ${t.last_name} ${t.first_name}`.trim());
  }
  return out;
}

/**
 * La classe d'arrivée, pour les établissements qui écrivent « Admis(e) en
 * classe de Terminale D » plutôt que « en classe supérieure ». Le passage d'un
 * cycle à l'autre n'est pas devinable : on renvoie alors rien, et le libellé
 * retombe sur « supérieure ».
 */
async function nextLevelName(ctx: TenantContext, levelId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('levels')
    .select('cycle_id, sequence')
    .eq('school_id', ctx.school.id)
    .eq('id', levelId)
    .maybeSingle();
  if (!current) return null;
  const { data: next } = await supabase
    .from('levels')
    .select('name')
    .eq('school_id', ctx.school.id)
    .eq('cycle_id', current.cycle_id)
    .gt('sequence', current.sequence)
    .order('sequence')
    .limit(1)
    .maybeSingle();
  return next?.name ?? null;
}

async function countAttendance(
  ctx: TenantContext,
  studentIds: string[],
  from: string,
  to: string,
): Promise<{ absences: Map<string, number>; lateness: Map<string, number> }> {
  const supabase = await createClient();
  // Les bornes de la periode s'appliquent EN BASE, et la lecture est paginee :
  // une classe compte des milliers d'appels sur un trimestre, et une lecture
  // simple s'arretait a 1 000 lignes sans le dire — les absences imprimees sur
  // le bulletin etaient alors sous-comptees, silencieusement.
  type Row = {
    id: string;
    student_id: string;
    status: string;
    attendance_registers: { session_occurrences: { occurs_on: string } | null } | null;
  };
  const rows = await fetchAllRows<Row>((cursor) => {
    let q = supabase
      .from('attendance_records')
      .select('id, student_id, status, attendance_registers!inner(session_occurrences!inner(occurs_on))')
      .eq('school_id', ctx.school.id)
      .in('status', ['ABSENT', 'LATE'])
      .in('student_id', studentIds)
      .gte('attendance_registers.session_occurrences.occurs_on', from)
      .lte('attendance_registers.session_occurrences.occurs_on', to)
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(500);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  }, 500);

  const absences = new Map<string, number>();
  const lateness = new Map<string, number>();
  for (const r of rows) {
    const target = r.status === 'ABSENT' ? absences : lateness;
    target.set(r.student_id, (target.get(r.student_id) ?? 0) + 1);
  }
  return { absences, lateness };
}
