import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { ReenrollCandidate } from './reenrollment-types';

export type { ReenrollCandidate } from './reenrollment-types';

/**
 * La réinscription : faire passer une classe à l'année suivante.
 *
 * Sans elle, une école qui ouvre 2027-2028 se retrouve avec zéro élève et doit
 * tout ressaisir. Le geste réel du secrétariat est « ma 6ème 1 monte en 5ème 2,
 * sauf ces trois-là qui redoublent » : c'est exactement ce que fait cet écran.
 *
 * Rien n'est écrasé : une inscription existe PAR ANNÉE (contrainte d'unicité
 * élève + année). L'année passée reste intacte avec ses notes et ses bulletins.
 */


/** Les élèves d'une classe, avec ce qui empêche ou non de les réinscrire. */
export async function reenrollCandidates(
  ctx: TenantContext,
  fromClassId: string,
  targetYearId: string,
): Promise<ReenrollCandidate[]> {
  const supabase = await createClient();

  const { data: source } = await supabase
    .from('student_enrollments')
    .select('student_id, is_repeating, status, students!inner(matricule, first_name, last_name, deleted_at)')
    .eq('school_id', ctx.school.id)
    .eq('class_id', fromClassId);

  const rows = (source ?? []) as unknown as {
    student_id: string;
    is_repeating: boolean;
    status: string;
    students: { matricule: string; first_name: string; last_name: string; deleted_at: string | null };
  }[];
  const ids = rows.filter((r) => r.students && !r.students.deleted_at).map((r) => r.student_id);
  if (ids.length === 0) return [];

  const already = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('student_enrollments')
      .select('student_id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', targetYearId)
      .in('student_id', ids.slice(i, i + 200));
    for (const r of data ?? []) already.add(r.student_id);
  }

  return rows
    .filter((r) => r.students && !r.students.deleted_at)
    .map((r) => ({
      studentId: r.student_id,
      matricule: r.students.matricule,
      name: `${r.students.last_name.toUpperCase()} ${r.students.first_name}`,
      wasRepeating: r.is_repeating,
      alreadyEnrolled: already.has(r.student_id),
      leftStatus: r.status,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ReenrollResult = { enrolled: number; skipped: number };

/**
 * Réinscrit les élèves choisis dans la classe d'arrivée.
 *
 * Écriture par paquets : une classe de 50 tient en une requête, un niveau
 * entier en quelques-unes. Un élève déjà inscrit dans l'année cible est ignoré
 * sans erreur — relancer l'opération ne fait jamais de doublon.
 */
export async function reenrollStudents(
  ctx: TenantContext,
  input: { targetYearId: string; toClassId: string; studentIds: string[]; repeatingIds: string[] },
): Promise<ReenrollResult> {
  requireWritable(ctx, 'enrollments.create');
  const supabase = await createClient();

  if (input.studentIds.length === 0) throw new ValidationError('Aucun élève sélectionné.');

  const { data: klass } = await supabase
    .from('classes')
    .select('id, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', input.toClassId)
    .maybeSingle();
  if (!klass) throw new NotFoundError('Classe d’arrivée introuvable.');
  if (klass.academic_year_id !== input.targetYearId) {
    throw new ValidationError('Cette classe n’appartient pas à l’année d’arrivée.');
  }

  const already = new Set<string>();
  for (let i = 0; i < input.studentIds.length; i += 200) {
    const { data } = await supabase
      .from('student_enrollments')
      .select('student_id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', input.targetYearId)
      .in('student_id', input.studentIds.slice(i, i + 200));
    for (const r of data ?? []) already.add(r.student_id);
  }

  const repeating = new Set(input.repeatingIds);
  const rows = input.studentIds
    .filter((id) => !already.has(id))
    .map((studentId) => ({
      school_id: ctx.school.id,
      student_id: studentId,
      academic_year_id: input.targetYearId,
      class_id: input.toClassId,
      is_repeating: repeating.has(studentId),
      status: 'ENROLLED' as const,
    }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('student_enrollments').insert(rows.slice(i, i + 200));
    if (error) throw error;
  }

  await audit(ctx, {
    action: 'enrollments.create',
    module: 'students',
    entityType: 'class',
    entityId: input.toClassId,
    after: { enrolled: rows.length, skipped: already.size, targetYearId: input.targetYearId, source: 'reinscription' },
  });
  return { enrolled: rows.length, skipped: already.size };
}
