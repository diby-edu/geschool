import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Photos d'élèves et d'enseignants (bucket `avatars`, prive — migration 0030).
 * `photo_url` en base ne stocke jamais une URL directement affichable : un
 * CHEMIN dans le bucket, signe a la lecture (URL a duree courte). Stocker une
 * URL signee reviendrait a coder en dur une duree de vie dans une colonne
 * censee etre stable.
 */

const SIGN_TTL_SECONDS = 60 * 60;

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
}

/** Depose la photo dans le bucket et renvoie le CHEMIN a stocker dans photo_url. */
export async function uploadAvatar(
  ctx: TenantContext,
  kind: 'students' | 'teachers',
  id: string,
  file: File,
): Promise<string> {
  const supabase = await createClient();
  const path = `schools/${ctx.school.id}/${kind}/${id}/photo.${extensionOf(file)}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Signe en un seul appel les chemins photo_url d'une liste d'eleves/enseignants. */
export async function signAvatarUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from('avatars').createSignedUrls(unique, SIGN_TTL_SECONDS);
  if (error || !data) return new Map();

  const map = new Map<string, string>();
  for (const row of data) {
    if (row.signedUrl && row.path) map.set(row.path, row.signedUrl);
  }
  return map;
}
