import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Avant de générer les bulletins d'une classe : ce qui n'est peut-être pas fini.
 *
 * Les moyennes se calculent en direct, notes en cours de saisie comprises. Un
 * bulletin généré pendant qu'un professeur saisit encore fige donc une moyenne
 * incomplète — et une fois validé par le conseil, il ne se régénère plus. On
 * ne bloque pas (l'école décide), mais on dit, matière par matière :
 *  - aucune note dans la période ;
 *  - des évaluations encore ouvertes (pas clôturées) ;
 *  - le professeur n'a pas coché « j'ai terminé mes moyennes » — seulement si
 *    l'école utilise cette étape pour la période (au moins une case cochée).
 */
export type ReadinessIssue = { subject: string; problems: string[] };

export async function bulletinReadiness(ctx: TenantContext, classId: string, periodId: string): Promise<ReadinessIssue[]> {
  const supabase = await createClient();

  const { data: klass } = await supabase
    .from('classes')
    .select('level_id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!klass) return [];

  const [{ data: programme }, { data: links }] = await Promise.all([
    supabase
      .from('level_subjects')
      .select('subject_id, subjects(name)')
      .eq('school_id', ctx.school.id)
      .eq('level_id', klass.level_id),
    supabase.from('group_classes').select('group_id').eq('school_id', ctx.school.id).eq('class_id', classId),
  ]);
  const subjects = ((programme ?? []) as unknown as { subject_id: string; subjects: { name: string } | null }[]).map((r) => ({
    id: r.subject_id,
    name: r.subjects?.name ?? 'Matière',
  }));
  if (subjects.length === 0) return [];
  const groupIds = (links ?? []).map((l) => l.group_id);

  // Évaluations de la période : celles de la classe, et celles de ses groupes (LV2, options).
  const target = groupIds.length > 0 ? `class_id.eq.${classId},group_id.in.(${groupIds.join(',')})` : `class_id.eq.${classId}`;
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, subject_id, status')
    .eq('school_id', ctx.school.id)
    .eq('academic_period_id', periodId)
    .or(target);
  const list = (assessments ?? []) as { id: string; subject_id: string; status: string }[];

  // Des notes existent-elles, matière par matière ? Une petite requête par
  // matière (« au moins une note ») : lire toutes les notes de la classe serait
  // tronqué au-delà de 1 000 lignes, et ferait croire à une matière vide.
  const gradedSubjects = new Set<string>();
  await Promise.all(
    subjects.map(async (s) => {
      const ids = list.filter((a) => a.subject_id === s.id).map((a) => a.id);
      if (ids.length === 0) return;
      const { data: g } = await supabase
        .from('grades')
        .select('id')
        .in('assessment_id', ids.slice(0, 150))
        .not('score', 'is', null)
        .limit(1);
      if ((g ?? []).length > 0) gradedSubjects.add(s.id);
    }),
  );

  // « J'ai terminé » : l'école l'utilise-t-elle pour cette période et cette classe ?
  const { data: assignments } = await supabase
    .from('teaching_assignments')
    .select('id, subject_id')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('status', 'ACTIVE');
  const assignmentIds = ((assignments ?? []) as { id: string; subject_id: string | null }[]).map((a) => a.id);
  const done = new Set<string>();
  if (assignmentIds.length > 0) {
    const { data: comp } = await supabase
      .from('average_completions')
      .select('teaching_assignment_id')
      .eq('academic_period_id', periodId)
      .in('teaching_assignment_id', assignmentIds);
    for (const c of (comp ?? []) as { teaching_assignment_id: string }[]) done.add(c.teaching_assignment_id);
  }
  const usesCompletion = done.size > 0;
  const doneSubjects = new Set(
    ((assignments ?? []) as { id: string; subject_id: string | null }[])
      .filter((a) => done.has(a.id) && a.subject_id)
      .map((a) => a.subject_id!),
  );

  const issues: ReadinessIssue[] = [];
  for (const s of subjects) {
    const ofSubject = list.filter((a) => a.subject_id === s.id);
    const problems: string[] = [];
    if (!gradedSubjects.has(s.id)) {
      problems.push('aucune note');
    } else {
      const open = ofSubject.filter((a) => a.status === 'DRAFT' || a.status === 'OPEN').length;
      if (open > 0) problems.push(`${open} évaluation${open > 1 ? 's' : ''} encore ouverte${open > 1 ? 's' : ''}`);
      if (usesCompletion && !doneSubjects.has(s.id)) problems.push('le professeur n’a pas indiqué avoir terminé');
    }
    if (problems.length > 0) issues.push({ subject: s.name, problems });
  }
  return issues;
}
