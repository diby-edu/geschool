import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable, hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { getAssessment } from './assessments';

export type GradeGridStudent = {
  studentId: string;
  matricule: string;
  name: string;
  score: number | null;
  isAbsent: boolean;
  isExcused: boolean;
  comment: string;
};

export type GradeGrid = {
  assessmentId: string;
  maxScore: number;
  status: string;
  editable: boolean;
  students: GradeGridStudent[];
};

/** Charge la grille de saisie : élèves inscrits + notes existantes. */
export async function loadGradeGrid(ctx: TenantContext, assessmentId: string): Promise<GradeGrid> {
  const supabase = await createClient();
  const assessment = await getAssessment(ctx, assessmentId);
  if (!assessment) throw new NotFoundError('Évaluation introuvable.');
  if (!assessment.class_id) throw new ValidationError('Cette évaluation ne cible pas une classe.');

  const { data: enr } = await supabase
    .from('student_enrollments')
    .select('student_id, students(matricule, first_name, last_name)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', assessment.class_id)
    .eq('status', 'ENROLLED');

  const { data: grades } = await supabase
    .from('grades')
    .select('student_id, score, is_absent, is_excused, comment')
    .eq('school_id', ctx.school.id)
    .eq('assessment_id', assessmentId);
  const byStudent = new Map((grades ?? []).map((g) => [g.student_id, g]));

  const students = ((enr ?? []) as unknown as {
    student_id: string;
    students: { matricule: string; first_name: string; last_name: string } | null;
  }[])
    .map((e) => {
      const g = byStudent.get(e.student_id);
      return {
        studentId: e.student_id,
        matricule: e.students?.matricule ?? '',
        name: e.students ? `${e.students.last_name.toUpperCase()} ${e.students.first_name}` : '—',
        score: g?.score ?? null,
        isAbsent: g?.is_absent ?? false,
        isExcused: g?.is_excused ?? false,
        comment: g?.comment ?? '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const editable = assessment.status === 'DRAFT' || assessment.status === 'OPEN' || hasPermission(ctx, 'grades.update');

  return { assessmentId, maxScore: assessment.max_score, status: assessment.status, editable, students };
}

export type GradeEntry = {
  studentId: string;
  score: number | null;
  isAbsent: boolean;
  isExcused: boolean;
  comment: string;
};

/**
 * Enregistre les notes d'une évaluation (upsert par élève). Validation stricte
 * côté serveur : le score tient dans [0, max_score], une absence n'a pas de
 * score. La grille est verrouillée après clôture, sauf droit « grades.update ».
 */
export async function saveGrades(ctx: TenantContext, assessmentId: string, entries: GradeEntry[]): Promise<{ saved: number }> {
  requireWritable(ctx, 'grades.create');
  const supabase = await createClient();

  const assessment = await getAssessment(ctx, assessmentId);
  if (!assessment) throw new NotFoundError('Évaluation introuvable.');
  const locked = assessment.status === 'CLOSED' || assessment.status === 'PUBLISHED';
  if (locked && !hasPermission(ctx, 'grades.update')) {
    throw new ConflictError('Évaluation clôturée : saisie verrouillée.');
  }
  const maxScore = assessment.max_score;

  const rows: TablesInsert<'grades'>[] = [];
  for (const e of entries) {
    if (e.isAbsent) {
      rows.push({
        school_id: ctx.school.id,
        assessment_id: assessmentId,
        student_id: e.studentId,
        score: null,
        is_absent: true,
        is_excused: e.isExcused,
        comment: e.comment || null,
        entered_by: ctx.user.id,
        updated_by: ctx.user.id,
      });
      continue;
    }
    if (e.score === null) continue; // rien saisi, rien à enregistrer
    if (e.score < 0 || e.score > maxScore) {
      throw new ValidationError(`Note hors barème : ${e.score} (attendu entre 0 et ${maxScore}).`);
    }
    rows.push({
      school_id: ctx.school.id,
      assessment_id: assessmentId,
      student_id: e.studentId,
      score: e.score,
      is_absent: false,
      is_excused: false,
      comment: e.comment || null,
      entered_by: ctx.user.id,
      updated_by: ctx.user.id,
    });
  }

  if (rows.length === 0) return { saved: 0 };

  const { error } = await supabase.from('grades').upsert(rows, { onConflict: 'assessment_id,student_id' });
  if (error) throw error;

  await audit(ctx, {
    action: 'grades.save',
    module: 'grades',
    entityType: 'assessment',
    entityId: assessmentId,
    after: { count: rows.length },
  });
  return { saved: rows.length };
}
