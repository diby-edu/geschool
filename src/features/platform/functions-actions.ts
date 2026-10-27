'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { CATALOG_CODES } from '@/lib/permissions/catalog';
import { requireAdmin } from './admin';
import { functionCodeFor } from './functions';

/**
 * Enregistrer les droits de départ d'une fonction (lot 6). Au choix : seulement
 * les nouvelles écoles, ou aussi les écoles existantes (on y AJOUTE les droits
 * cochés, on n'en retire jamais). Seuls les droits affichés (le catalogue)
 * peuvent être retirés du modèle : un droit technique n'est jamais touché.
 */
export async function saveTemplateAction(code: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const permissions = fd
      .getAll('perm')
      .map(String)
      .filter((c) => CATALOG_CODES.has(c));
    const existing = fd.get('scope') === 'existing';
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('platform_save_template' as never, {
      p_code: code,
      p_permissions: permissions,
      p_shown: [...CATALOG_CODES],
      p_existing: existing,
    } as never);
    if (error) throw new ValidationError(error.message);
    await auditPlatform(userId, {
      action: 'platform.template_save',
      module: 'platform',
      entityType: 'role',
      after: { code, permissions: permissions.length, existing, schools: data },
    });
    revalidatePath('/admin/fonctions');
    redirect(`/admin/fonctions?f=${code}&enregistre=${existing ? `ecoles-${Number(data ?? 0)}` : 'nouvelles'}`);
  });
}

/** Créer une fonction (« F_… »), en partant des droits d'une autre au choix. */
export async function createFunctionAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const name = String(fd.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 60) throw new ValidationError('Donnez un nom à la fonction (2 à 60 caractères).');
    const code = functionCodeFor(name);
    const copyFrom = String(fd.get('copyFrom') ?? '') || null;
    const supabase = await createClient();
    const { error } = await supabase.rpc('platform_create_function' as never, {
      p_code: code,
      p_name: name,
      p_description: String(fd.get('description') ?? '').trim().slice(0, 300),
      p_copy_from: copyFrom,
    } as never);
    if (error) throw new ValidationError(error.code === '23505' ? 'Une fonction porte déjà ce nom.' : error.message);
    let pushed = 0;
    if (fd.get('scope') === 'existing') {
      const { data, error: pushError } = await supabase.rpc('platform_push_functions' as never);
      if (pushError) throw new ValidationError(pushError.message);
      pushed = Number(data ?? 0);
    }
    await auditPlatform(userId, { action: 'platform.function_create', module: 'platform', entityType: 'role', after: { code, name, copyFrom, pushed } });
    revalidatePath('/admin/fonctions');
    redirect(`/admin/fonctions?f=${code}&cree=1`);
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}

/** Donner les fonctions créées aux écoles qui ne les ont pas encore. */
export async function pushFunctionsAction(code: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('platform_push_functions' as never);
    if (error) throw new ValidationError(error.message);
    await auditPlatform(userId, { action: 'platform.function_push', module: 'platform', entityType: 'role', after: { code, created: data } });
    revalidatePath('/admin/fonctions');
    redirect(`/admin/fonctions?f=${code}&donnee=1`);
  });
}
