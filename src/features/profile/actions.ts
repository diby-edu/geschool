'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Photo de profil : chacun dépose la sienne (migration 0064). Le chemin est
 * stocké dans `users.avatar_url` ; l'URL affichable est signée à la lecture.
 */
export async function saveOwnPhotoAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const file = fd.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new ValidationError('Choisissez une photo.');
    if (file.size > MAX_BYTES) throw new ValidationError('Photo trop lourde : 2 Mo au maximum.');
    const ext = TYPES[file.type];
    if (!ext) throw new ValidationError('Format accepté : JPEG, PNG ou WebP.');

    const supabase = await createClient();
    const path = `schools/${ctx.school.id}/users/${ctx.user.id}/photo.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw new ValidationError('L’envoi de la photo a échoué. Réessayez.');

    const { error: saveError } = await supabase.from('users').update({ avatar_url: path }).eq('id', ctx.user.id);
    if (saveError) throw saveError;

    await audit(ctx, { action: 'profile.photo', module: 'settings', entityType: 'user', entityId: ctx.user.id });
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/profil?updated=1`);
  });
}

/** Retire sa photo : on revient aux initiales. */
export async function removeOwnPhotoAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const supabase = await createClient();
    const { data } = await supabase.from('users').select('avatar_url').eq('id', ctx.user.id).maybeSingle();
    if (data?.avatar_url) await supabase.storage.from('avatars').remove([data.avatar_url]);
    const { error } = await supabase.from('users').update({ avatar_url: null }).eq('id', ctx.user.id);
    if (error) throw error;
    await audit(ctx, { action: 'profile.photo_remove', module: 'settings', entityType: 'user', entityId: ctx.user.id });
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/profil?deleted=1`);
  });
}
