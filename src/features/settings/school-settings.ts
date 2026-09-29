import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';

/**
 * Réglages d'établissement (`school_settings`, migration 0002) : une ligne par
 * espace, un objet JSON dedans. La lecture est ouverte à tout membre — ces
 * réglages pilotent le comportement de l'application — l'écriture exige
 * `settings.update` (RLS 0006).
 *
 * On ne remplace jamais l'objet entier : on fusionne, pour qu'un réglage ajouté
 * plus tard ne soit pas effacé par un écran qui l'ignore.
 */

export type SettingsNamespace = 'academic' | 'grading' | 'attendance' | 'schedule' | 'reporting' | 'notifications' | 'access';

export async function readSettings(ctx: TenantContext, namespace: SettingsNamespace): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('school_settings')
    .select('settings')
    .eq('school_id', ctx.school.id)
    .eq('namespace', namespace)
    .maybeSingle();
  const value = data?.settings;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function writeSettings(
  ctx: TenantContext,
  namespace: SettingsNamespace,
  patch: Record<string, unknown>,
): Promise<void> {
  requireWritable(ctx, 'settings.update');
  const supabase = await createClient();
  const current = await readSettings(ctx, namespace);
  const { error } = await supabase
    .from('school_settings')
    .upsert(
      {
        school_id: ctx.school.id,
        namespace,
        settings: { ...current, ...patch } as never,
        updated_by: ctx.user.id,
      },
      { onConflict: 'school_id,namespace' },
    );
  if (error) throw error;
}
