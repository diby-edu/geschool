'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { CONSTRAINT_SCOPES, type ConstraintScope, type ParamValues, type Severity } from './catalog';
import { createRule, deleteRule, toggleRule, DEFAULT_WEIGHT } from './service';

const isScope = (v: string): v is ConstraintScope => (CONSTRAINT_SCOPES as readonly string[]).includes(v);

/**
 * Les paramètres arrivent en un seul champ JSON, construit par le formulaire.
 * Le serveur ne fait pas confiance à ce qu'il reçoit : le service revalide
 * chaque valeur contre le catalogue avant d'écrire quoi que ce soit.
 */
function readParams(raw: FormDataEntryValue | null): ParamValues {
  try {
    const parsed = JSON.parse(String(raw ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ParamValues) : {};
  } catch {
    return {};
  }
}

export async function createRuleAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const scope = String(fd.get('scopeType') ?? '');
    const severity = String(fd.get('severity') ?? 'HARD') === 'SOFT' ? 'SOFT' : 'HARD';
    const weight = Number(fd.get('weight') ?? DEFAULT_WEIGHT);

    await createRule(ctx, {
      code: String(fd.get('code') ?? ''),
      scopeType: isScope(scope) ? scope : 'SCHOOL',
      scopeId: String(fd.get('scopeId') ?? '') || null,
      severity: severity as Severity,
      weight: Number.isFinite(weight) ? weight : DEFAULT_WEIGHT,
      params: readParams(fd.get('params')),
    });
    redirect(`/e/${slug}/schedule/regles?ajoutee=1`);
  });
}

export async function toggleRuleAction(
  slug: string,
  id: string,
  enabled: boolean,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await toggleRule(ctx, id, enabled);
    redirect(`/e/${slug}/schedule/regles?${enabled ? 'activee' : 'desactivee'}=1`);
  });
}

export async function deleteRuleAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRule(ctx, id);
    redirect(`/e/${slug}/schedule/regles?supprimee=1`);
  });
}
