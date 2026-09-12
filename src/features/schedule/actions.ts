'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { scheduleConfigSchema, sessionSchema, requirementSchema } from './schemas';
import { saveConfig } from './config';
import { createVersion, publishVersion, deleteVersion } from './versions';
import { addSession, deleteSession } from './sessions';
import { syncRequirementsFromAssignments, updateRequirement, deleteRequirement } from './requirements';
import { generateSchedule } from './generation';
import { isAppError, ValidationError } from '@/lib/errors';

export async function saveConfigAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await saveConfig(ctx, scheduleConfigSchema.parse({
      workingDays: fd.getAll('workingDays'),
      dayStart: fd.get('dayStart'),
      dayEnd: fd.get('dayEnd'),
      slotMinutes: fd.get('slotMinutes'),
    }));
    redirect(`/e/${slug}/schedule?configured=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function createVersionAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const id = await createVersion(ctx);
    redirect(`/e/${slug}/schedule/${id}`);
  });
}

export async function publishVersionAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await publishVersion(ctx, id);
    redirect(`/e/${slug}/schedule/${id}?published=1`);
  });
}

export async function deleteVersionAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteVersion(ctx, id);
    redirect(`/e/${slug}/schedule?deleted=1`);
  });
}

export async function addSessionAction(slug: string, versionId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await addSession(ctx, versionId, sessionSchema.parse({
      startSlotId: fd.get('startSlotId'),
      endSlotId: fd.get('endSlotId'),
      subjectId: fd.get('subjectId'),
      teacherId: fd.get('teacherId') ?? '',
      classId: fd.get('classId'),
      roomId: fd.get('roomId') ?? '',
    }));
    redirect(`/e/${slug}/schedule/${versionId}?added=1&class=${fd.get('classId')}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteSessionAction(slug: string, versionId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteSession(ctx, id);
    redirect(`/e/${slug}/schedule/${versionId}?removed=1`);
  });
}

// --- Exigences pedagogiques + generation (lot 7) ---

export async function syncRequirementsAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError('Activez une annee scolaire d\'abord.');
    const { created, skipped } = await syncRequirementsFromAssignments(ctx, ctx.academicYear.id);
    redirect(`/e/${slug}/schedule/generate?synced=${created}&kept=${skipped}`);
  });
}

export async function updateRequirementAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateRequirement(ctx, id, requirementSchema.parse({
      sessionsCount: fd.get('sessionsCount'),
      sessionDurationMinutes: fd.get('sessionDurationMinutes'),
      roomMode: fd.get('roomMode'),
      status: fd.get('status'),
    }));
    redirect(`/e/${slug}/schedule/generate?updated=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteRequirementAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRequirement(ctx, id);
    redirect(`/e/${slug}/schedule/generate?reqdeleted=1`);
  });
}

/**
 * Lance une generation. Synchrone et bornee (ADR-014) : le solveur a un delai
 * strict, le resultat est renvoye dans l'etat du formulaire pour affichage
 * immediat (succes -> redirection vers la version, infaisable -> diagnostic).
 *
 * N'utilise pas runFormAction : le cas infaisable doit RENVOYER un etat riche
 * (liste de diagnostics), que runFormAction ne propagerait pas.
 */
export async function generateScheduleAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  try {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) return { error: "Activez une annee scolaire d'abord." };

    const result = await generateSchedule(ctx, ctx.academicYear.id);
    if (result.status === 'SUCCEEDED' && result.versionId) {
      redirect(`/e/${slug}/schedule/${result.versionId}?generated=${result.assignedCount}`);
    }
    return {
      error:
        result.status === 'INFEASIBLE'
          ? 'Aucun emploi du temps possible avec les contraintes actuelles.'
          : (result.message ?? 'La generation a echoue.'),
      values: { diagnostics: JSON.stringify(result.diagnostics), status: result.status },
    };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as { digest: unknown }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    if (isAppError(error)) return { error: error.message };
    console.error('[generate-action]', error);
    return { error: "Une erreur inattendue s'est produite pendant la generation." };
  }
}
