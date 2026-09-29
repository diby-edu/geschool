'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { assignmentSchema, groupAssignmentSchema } from './schemas';
import {
  createAssignment,
  createGroupAssignment,
  deleteAssignment,
  saveAssignmentGrid,
  carryOverAssignments,
} from './service';

export async function createAssignmentAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createAssignment(ctx, assignmentSchema.parse({
      teacherId: fd.get('teacherId'),
      subjectId: fd.get('subjectId'),
      classId: fd.get('classId'),
      weeklyMinutes: fd.get('weeklyMinutes') ?? 0,
    }));
    redirect(`/e/${slug}/assignments?created=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Confier un groupe a un enseignant, depuis la fiche du groupe. */
export async function createGroupAssignmentAction(
  slug: string,
  groupId: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createGroupAssignment(ctx, groupId, groupAssignmentSchema.parse({
      teacherId: fd.get('teacherId'),
      subjectId: fd.get('subjectId'),
      weeklyMinutes: fd.get('weeklyMinutes') ?? 0,
    }));
    redirect(`/e/${slug}/groupes/${groupId}?affecte=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Retirer une affectation depuis la fiche d'un groupe. */
export async function deleteGroupAssignmentAction(
  slug: string,
  groupId: string,
  id: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteAssignment(ctx, id);
    redirect(`/e/${slug}/groupes/${groupId}?retire=1`);
  });
}

export async function deleteAssignmentAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteAssignment(ctx, id);
    redirect(`/e/${slug}/assignments?deleted=1`);
  });
}

/**
 * Enregistre la grille d'un niveau. Chaque case arrive sous la forme
 * `prof:<classe>:<matiere>` ; vide = personne n'assure ce cours.
 */
export async function saveGridAction(slug: string, levelId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const cells: { classId: string; subjectId: string; teacherId: string | null }[] = [];
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith('prof:')) continue;
      const [, classId, subjectId] = key.split(':');
      if (!classId || !subjectId) continue;
      const teacherId = String(value).trim();
      cells.push({ classId, subjectId, teacherId: teacherId || null });
    }
    const r = await saveAssignmentGrid(ctx, levelId, cells);
    const params = new URLSearchParams({ niveau: levelId, crees: String(r.created) });
    if (r.changed > 0) params.set('changes', String(r.changed));
    if (r.removed > 0) params.set('retires', String(r.removed));
    redirect(`/e/${slug}/assignments?${params.toString()}`);
  });
}

/** Reprend les affectations de l'année précédente pour ce niveau. */
export async function carryOverAction(slug: string, levelId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await carryOverAssignments(ctx, levelId);
    redirect(`/e/${slug}/assignments?niveau=${levelId}&reconduites=${r.added}`);
  });
}
