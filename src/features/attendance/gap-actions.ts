'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { runFormAction, type FormState } from '@/lib/forms';
import { clearGap, qualifyGap, writeGapReasons } from './gaps';
import { REASON_CODE_MAX, slugReason, type GapReason } from './gap-types';

/** Dire pourquoi l'appel n'a pas ete fait sur ce creneau. */
export async function qualifyGapAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const occurrenceId = String(fd.get('occurrenceId') ?? '');
    await qualifyGap(ctx, occurrenceId, String(fd.get('reason') ?? ''), String(fd.get('note') ?? ''));
    redirect(`/e/${slug}/attendance/non-faits?${params(fd)}&qualifie=1`);
  });
}

/** Retirer une qualification posee par erreur. */
export async function clearGapAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await clearGap(ctx, String(fd.get('occurrenceId') ?? ''));
    redirect(`/e/${slug}/attendance/non-faits?${params(fd)}&efface=1`);
  });
}

/**
 * La liste des motifs de l'etablissement.
 *
 * Le formulaire envoie des lignes paralleles (code + libelle) : une ligne vide
 * est simplement ignoree, ce qui permet de supprimer un motif en effacant son
 * libelle.
 */
export async function saveGapReasonsAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');

    const codes = fd.getAll('reasonCode').map(String);
    const labels = fd.getAll('reasonLabel').map(String);
    // Les cases cochees arrivent par INDEX de ligne, pas par code : un motif
    // ajoute n'a pas encore de code au moment ou on coche.
    const blames = new Set(fd.getAll('reasonBlames').map(String));

    const reasons: GapReason[] = [];
    const vus = new Set<string>();
    for (let i = 0; i < labels.length; i += 1) {
      const label = (labels[i] ?? '').trim();
      // Libelle efface = motif retire. C'est la facon la plus simple de
      // supprimer une ligne sans bouton dedie.
      if (!label) continue;
      // Un motif ajoute arrive sans code : on le derive du libelle. Les
      // motifs existants gardent le leur, sinon les creneaux deja qualifies
      // perdraient leur reference.
      let code = (codes[i] ?? '').trim().slice(0, REASON_CODE_MAX) || slugReason(label);
      if (vus.has(code)) {
        let n = 2;
        while (vus.has(`${code}_${n}`)) n += 1;
        code = `${code}_${n}`.slice(0, REASON_CODE_MAX);
      }
      vus.add(code);
      reasons.push({ code, label, ...(blames.has(String(i)) ? { blamesTeacher: true } : {}) });
    }

    await writeGapReasons(ctx, reasons);
    redirect(`/e/${slug}/attendance/regles?enregistre=1`);
  });
}

/**
 * Garde la periode ET l'enseignant ouvert apres l'action.
 *
 * Sans cela, qualifier un creneau renvoyait a la vue d'ensemble : il fallait
 * rouvrir l'enseignant a chaque ligne.
 */
function params(fd: FormData): string {
  const q = new URLSearchParams();
  const du = String(fd.get('from') ?? '');
  const au = String(fd.get('to') ?? '');
  const prof = String(fd.get('prof') ?? '');
  if (du) q.set('du', du);
  if (au) q.set('au', au);
  if (prof) q.set('prof', prof);
  return q.toString();
}
