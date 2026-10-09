'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { writeSettings } from '@/features/settings/school-settings';
import { AUDIT_MODULES } from './queries';
import { journalPatch, parseWho } from './journal-prefs';

/**
 * Enregistre les cases cochées du journal comme affichage par défaut de l'école.
 * Les cases décochées deviennent les domaines masqués. Exige `settings.update`
 * (writeSettings) : sans ce droit, on filtre quand même, sans mémoriser.
 */
export async function saveJournalPrefsAction(slug: string, fd: FormData): Promise<void> {
  const ctx = await getTenantContext(slug);
  const shown = new Set(fd.getAll('d').map(String));
  const hidden = AUDIT_MODULES.filter((m) => !shown.has(m));
  await writeSettings(ctx, 'access', journalPatch({ hidden, who: parseWho(fd.get('who')) }));
  redirect(`/e/${slug}/audit?saved=1`);
}
