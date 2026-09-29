import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { signAvatarUrls } from '@/lib/storage/avatars';
import { getAssessment, requireAssessmentAccess } from './assessments';

export type GradeGridStudent = {
  studentId: string;
  matricule: string;
  name: string;
  photoUrl: string | null;
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
  if (!assessment.class_id && !assessment.group_id) {
    throw new ValidationError('Cette évaluation ne cible ni une classe ni un groupe.');
  }

  // Une évaluation de GROUPE ne liste que les élèves du groupe : le professeur
  // d'allemand ne voit pas les hispanisants de la même classe.
  const { data: enr } = assessment.group_id
    ? await supabase
        .from('student_groups')
        .select('student_id, students(matricule, first_name, last_name, photo_url)')
        .eq('school_id', ctx.school.id)
        .eq('group_id', assessment.group_id)
        .is('left_at', null)
    : await supabase
        .from('student_enrollments')
        .select('student_id, students(matricule, first_name, last_name, photo_url)')
        .eq('school_id', ctx.school.id)
        .eq('class_id', assessment.class_id!)
        .eq('status', 'ENROLLED');

  const { data: grades } = await supabase
    .from('grades')
    .select('student_id, score, is_absent, is_excused, comment')
    .eq('school_id', ctx.school.id)
    .eq('assessment_id', assessmentId);
  const byStudent = new Map((grades ?? []).map((g) => [g.student_id, g]));

  const enrRows = (enr ?? []) as unknown as {
    student_id: string;
    students: { matricule: string; first_name: string; last_name: string; photo_url: string | null } | null;
  }[];
  const signedByPath = await signAvatarUrls(enrRows.map((e) => e.students?.photo_url));

  const students = enrRows
    .map((e) => {
      const g = byStudent.get(e.student_id);
      const path = e.students?.photo_url ?? null;
      return {
        studentId: e.student_id,
        matricule: e.students?.matricule ?? '',
        name: e.students ? `${e.students.last_name.toUpperCase()} ${e.students.first_name}` : '—',
        photoUrl: path ? (signedByPath.get(path) ?? null) : null,
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
  const supabase = await createClient();

  const assessment = await getAssessment(ctx, assessmentId);
  if (!assessment) throw new NotFoundError('Évaluation introuvable.');
  // Propriétaire de l'évaluation, ou détenteur de la permission générale grades.create.
  await requireAssessmentAccess(ctx, assessment, 'grade');
  const locked = assessment.status === 'CLOSED' || assessment.status === 'PUBLISHED';
  if (locked && !hasPermission(ctx, 'grades.update')) {
    throw new ConflictError('Évaluation clôturée : saisie verrouillée.');
  }
  const maxScore = assessment.max_score;

  // Ce qui existait avant d'enregistrer : effacer un champ deja vide n'est pas
  // un echec, effacer une note existante qui reste en base en est un.
  const { data: before } = await supabase
    .from('grades')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .eq('assessment_id', assessmentId);
  const existing = new Set((before ?? []).map((g) => g.student_id));

  const rows: TablesInsert<'grades'>[] = [];
  // Une note effacee doit disparaitre. Auparavant un champ vide etait
  // simplement ignore : une note saisie par erreur restait en base, sans aucun
  // moyen de la retirer depuis l'ecran.
  const toDelete: string[] = [];
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
    if (e.score === null) {
      if (existing.has(e.studentId)) toDelete.push(e.studentId);
      continue;
    }
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

  if (toDelete.length > 0) {
    // Compte exact : sans droit de suppression, la base ne renvoie pas d'erreur,
    // elle ne touche simplement aucune ligne — et la note reparaitrait au
    // rechargement sans que personne ne comprenne pourquoi.
    let asked = 0;
    let removed = 0;
    for (let i = 0; i < toDelete.length; i += 200) {
      const slice = toDelete.slice(i, i + 200);
      const { error, count } = await supabase
        .from('grades')
        .delete({ count: 'exact' })
        .eq('school_id', ctx.school.id)
        .eq('assessment_id', assessmentId)
        .in('student_id', slice);
      if (error) throw error;
      asked += slice.length;
      removed += count ?? 0;
    }
    if (removed === 0 && asked > 0) {
      throw new ConflictError('Ces notes n’ont pas pu être effacées : l’évaluation est clôturée, ou ce droit vous manque.');
    }
  }

  if (rows.length === 0) return { saved: 0 };

  const { error } = await supabase.from('grades').upsert(rows, { onConflict: 'assessment_id,student_id' });
  if (error) throw error;

  // `grades` n'est pas diffusee en direct (des centaines de milliers de lignes) :
  // on signale la validation sur l'evaluation, qui l'est. Un echec ici ne doit pas
  // faire perdre des notes deja enregistrees.
  await supabase
    .from('assessments')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', assessmentId)
    .eq('school_id', ctx.school.id);

  await audit(ctx, {
    action: 'grades.save',
    module: 'grades',
    entityType: 'assessment',
    entityId: assessmentId,
    after: { count: rows.length },
  });
  return { saved: rows.length };
}
