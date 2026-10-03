'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { scheduleConfigSchema, sessionSchema, requirementSchema } from './schemas';
import { saveConfig, deleteConfig } from './config';
import { createVersion, publishVersion, deleteVersion,
  validateVersion,
  reopenVersion,
} from './versions';
import { addSession, deleteSession } from './sessions';
import { syncRequirementsFromAssignments, updateRequirement, deleteRequirement } from './requirements';
import { setSessionLock } from './constraints/locks';
import { moveSession } from './constraints/moves';
import { generateVariants, generateSchedule } from './generation';
import { isAppError, ValidationError } from '@/lib/errors';

const BREAK_KEYS = ['break1', 'break2'] as const;

export async function saveConfigAction(
  slug: string,
  yearId: string,
  cycleId: string | null,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const workingDays = fd.getAll('workingDays').map(Number);
    // Pour CHAQUE jour travaillé : le matin (début, fin) et, s'il y a cours
    // l'après-midi, sa reprise et sa fin. La pause déjeuner est l'écart entre les
    // deux ; un mercredi sans après-midi n'a que le matin.
    const dayHours = workingDays.map((day) => {
      const field = (name: string) => String(fd.get(`${name}_${day}`) ?? '');
      const afternoon = fd.get(`pm_on_${day}`) === '1';
      return afternoon
        ? { day, start: field('am_start'), end: field('pm_end'), lunchStart: field('am_end'), lunchEnd: field('pm_start') }
        : { day, start: field('am_start'), end: field('am_end') };
    });
    const breaks = BREAK_KEYS.filter((k) => fd.get(`${k}_on`) === '1').map((k) => ({
      start: String(fd.get(`${k}_start`) ?? ''),
      end: String(fd.get(`${k}_end`) ?? ''),
      label: String(fd.get(`${k}_label`) ?? ''),
    }));
    await saveConfig(
      ctx,
      yearId,
      scheduleConfigSchema.parse({
        workingDays,
        slotMinutes: fd.get('slotMinutes'),
        dayHours,
        breaks,
      }),
      cycleId,
    );
    // On quitte le formulaire : la grille d'un cycle revient à la fiche de l'année
    // (qui liste les cycles), celle de l'établissement à Paramètres, rubrique
    // « Établissement » (d'où l'on vient).
    redirect(
      cycleId
        ? `/e/${slug}/academic-years/${yearId}?onglet=horaires&configured=1`
        : `/e/${slug}/parametres?configured=1#hub-etablissement`,
    );
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteConfigAction(
  slug: string,
  yearId: string,
  cycleId: string,
  configId: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteConfig(ctx, configId);
    redirect(`/e/${slug}/academic-years/${yearId}/hours/${cycleId}?deleted=1`);
  });
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
    if (!ctx.academicYear) throw new ValidationError('Activez une année scolaire d\'abord.');
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
      roomTarget: fd.get('roomTarget') ?? '',
      minCapacity: fd.get('minCapacity') === null || fd.get('minCapacity') === '' ? undefined : fd.get('minCapacity'),
      requiredFeatures: fd.getAll('requiredFeatures').map(String),
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
export async function generateScheduleAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  try {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) return { error: "Activez une année scolaire d'abord." };

    const cycleId = String(fd.get('cycleId') ?? '').trim() || undefined;
    const targetVersionId = String(fd.get('targetVersionId') ?? '').trim() || undefined;

    // Plusieurs variantes : on les enchaîne, puis on montre la comparaison.
    const variants = Math.max(1, Math.min(Number(fd.get('variants') ?? 1) || 1, 3));
    if (variants > 1) {
      const runs = await generateVariants(ctx, ctx.academicYear.id, cycleId, variants);
      const ok = runs.filter((r) => r.status === 'SUCCEEDED' && r.versionId);
      if (ok.length > 0) {
        redirect(`/e/${slug}/schedule/variantes?ids=${ok.map((r) => r.versionId).join(',')}`);
      }
      const failed = runs[0];
      return {
        error:
          failed?.status === 'INFEASIBLE'
            ? 'Aucun emploi du temps possible avec les contraintes actuelles.'
            : 'La génération a échoué.',
        values: { status: failed?.status ?? 'FAILED' },
      };
    }

    const result = await generateSchedule(ctx, ctx.academicYear.id, cycleId, targetVersionId);
    if (result.status === 'SUCCEEDED' && result.versionId) {
      redirect(`/e/${slug}/schedule/${result.versionId}?generated=${result.assignedCount}`);
    }
    return {
      error:
        result.status === 'INFEASIBLE'
          ? 'Aucun emploi du temps possible avec les contraintes actuelles.'
          : (result.message ?? 'La génération a échoué.'),
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
    return { error: "Une erreur inattendue s'est produite pendant la génération." };
  }
}

/**
 * Verrouille ou libère une séance. Une séance verrouillée retrouve exactement
 * sa place à la prochaine génération : le solveur compose autour d'elle.
 */
export async function toggleSessionLockAction(
  slug: string,
  versionId: string,
  sessionId: string,
  locked: boolean,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setSessionLock(ctx, sessionId, locked);
    redirect(`/e/${slug}/schedule/${versionId}?${locked ? 'verrouillee' : 'liberee'}=1`);
  });
}

/**
 * Déplace une séance après contrôle. Le refus explique ce qui bloque plutôt
 * que d'afficher « impossible » sans raison.
 */
export async function moveSessionAction(
  slug: string,
  versionId: string,
  sessionId: string,
  slotId: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await moveSession(ctx, versionId, sessionId, slotId);
    redirect(`/e/${slug}/schedule/${versionId}?deplacee=1`);
  });
}

/** Vérifier une version avant de la diffuser. */
export async function validateVersionAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await validateVersion(ctx, id, String(fd.get('note') ?? ''));
    redirect(`/e/${slug}/schedule/${id}?validee=1`);
  });
}

/** Rendre une version vérifiée à l'atelier. */
export async function reopenVersionAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reopenVersion(ctx, id);
    redirect(`/e/${slug}/schedule/${id}?rouverte=1`);
  });
}
