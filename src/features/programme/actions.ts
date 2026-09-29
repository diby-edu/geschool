'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { minutesFromSessions } from './hours';
import type { ProgrammeRow } from './plan';
import {
  applyOfficialProgramme,
  applyOfficialSessions,
  saveCoefficientMatrix,
  saveLevelProgramme,
  saveSessionsMatrix,
  sessionMinutesForLevel,
} from './service';

/** Charge la grille officielle ivoirienne, puis revient au programme avec le bilan. */
export async function applyOfficialProgrammeAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await applyOfficialProgramme(ctx);
    redirect(`/e/${slug}/programme?official=${r.levels}-${r.subjects}-${r.entries}`);
  });
}

/**
 * Le coefficient d'une ligne cochée. Le formulaire impose déjà un nombre
 * positif ; ce garde-fou sert aux envois hors navigateur, pour qu'une matière
 * cochée n'entre jamais au programme avec un poids nul.
 */
function coefficientOf(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, 100);
}

/**
 * L'écran de réglage revient là d'où il vient : l'onglet « Matières par
 * niveau » ou la page Programme. On n'accepte qu'un chemin de CETTE école,
 * jamais une adresse venue d'ailleurs.
 */
function safeReturn(slug: string, raw: FormDataEntryValue | null, levelId: string): string {
  const base = `/e/${slug}/`;
  const value = String(raw ?? '');
  if (!value.startsWith(base) || value.includes('//')) return `${base}programme?level=${levelId}`;
  return value;
}

/**
 * Enregistre le programme d'un niveau en une fois. Chaque matière de l'ordre
 * envoie son identifiant (`sid`), sa case `on:<id>`, son coefficient
 * `coef:<id>`, ses séances hebdomadaires `s:<id>` et sa case facultative
 * `fac:<id>`.
 *
 * Les séances se convertissent en minutes CÔTÉ SERVEUR, contre la grille
 * horaire du cycle : le navigateur n'a pas à connaître la durée d'un créneau,
 * et ne peut pas la fausser.
 */
export async function saveLevelProgrammeAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const levelId = String(fd.get('levelId') ?? '');
    const slot = await sessionMinutesForLevel(ctx, levelId);
    const rows: ProgrammeRow[] = fd.getAll('sid').map((entry) => {
      const id = String(entry);
      return {
        subjectId: id,
        included: fd.get(`on:${id}`) != null,
        coefficient: coefficientOf(fd.get(`coef:${id}`)),
        weeklyMinutes: minutesFromSessions(String(fd.get(`s:${id}`) ?? ''), slot),
        // Case « Fac. » cochée = matière facultative.
        mandatory: fd.get(`fac:${id}`) == null,
      };
    });

    const r = await saveLevelProgramme(ctx, levelId, rows);
    const back = safeReturn(slug, fd.get('returnTo'), levelId);
    const sep = back.includes('?') ? '&' : '?';
    redirect(`${back}${sep}enregistre=${r.added}-${r.changed}-${r.removed}`);
  });
}

/**
 * Enregistre le tableau croisé. Chaque case arrive sous la forme
 * `coef:<niveau>:<matiere>` ; vide = la matière quitte ce niveau.
 */
export async function saveMatrixAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const cells: { levelId: string; subjectId: string; coefficient: number | null }[] = [];
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith('coef:')) continue;
      const [, levelId, subjectId] = key.split(':');
      if (!levelId || !subjectId) continue;
      const raw = String(value).trim().replace(',', '.');
      const n = raw === '' ? null : Number(raw);
      if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 100)) continue;
      cells.push({ levelId, subjectId, coefficient: n });
    }
    const r = await saveCoefficientMatrix(ctx, cells);
    const params = new URLSearchParams({ onglet: 'coefficients', enregistres: String(r.changed) });
    if (r.removed > 0) params.set('retires', String(r.removed));
    redirect(`/e/${slug}/subjects?${params.toString()}`);
  });
}

/**
 * Enregistre le tableau croisé des séances. Chaque case arrive sous la forme
 * `sess:<niveau>:<matiere>` ; vide ou 0 = aucune séance à placer.
 */
export async function saveSessionsMatrixAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const cells: { levelId: string; subjectId: string; sessions: number }[] = [];
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith('sess:')) continue;
      const [, levelId, subjectId] = key.split(':');
      if (!levelId || !subjectId) continue;
      const raw = String(value).trim();
      const n = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 50) continue;
      cells.push({ levelId, subjectId, sessions: Math.round(n) });
    }
    const r = await saveSessionsMatrix(ctx, cells);
    redirect(`/e/${slug}/subjects?onglet=volumes&enregistres=${r.changed}`);
  });
}

/** Remplit les séances manquantes depuis la grille officielle, sans rien écraser. */
export async function applyOfficialSessionsAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await applyOfficialSessions(ctx);
    redirect(`/e/${slug}/subjects?onglet=volumes&remplies=${r.filled}`);
  });
}
