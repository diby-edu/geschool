import 'server-only';

import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { FEATURES, type FeatureCode } from '@/lib/modules/features';

/**
 * Modules d'un établissement, vus de la plateforme.
 *
 * C'est ici que se décide ce qu'une école a acheté. L'établissement ne peut pas
 * se servir lui-même : la RLS (0070) réserve l'écriture au Super Admin, et la
 * base ne garde que les modules COUPÉS — tout le reste est actif.
 */

export type SchoolFeatureRow = {
  code: FeatureCode;
  label: string;
  description: string;
  enabled: boolean;
  reason: string | null;
};

async function requirePlatformAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthorizationError();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) throw new AuthorizationError('Reserve aux administrateurs de la plateforme.');
  return { supabase, userId: user.id };
}

export async function listSchoolFeatures(schoolId: string): Promise<SchoolFeatureRow[]> {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase
    .from('school_features')
    .select('feature_code, is_enabled, override_reason')
    .eq('school_id', schoolId);

  const byCode = new Map(
    ((data ?? []) as { feature_code: string; is_enabled: boolean; override_reason: string | null }[]).map((r) => [
      r.feature_code,
      r,
    ]),
  );

  return FEATURES.map((f) => {
    const row = byCode.get(f.code);
    return {
      code: f.code,
      label: f.label,
      description: f.description,
      enabled: row ? row.is_enabled : true,
      reason: row?.override_reason ?? null,
    };
  });
}

/** Active ou coupe un module pour un établissement. */
export async function setSchoolFeature(
  schoolId: string,
  code: FeatureCode,
  enabled: boolean,
  reason: string,
): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();

  const { data: school } = await supabase.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
  if (!school) throw new NotFoundError('Établissement introuvable.');

  const { error } = await supabase.from('school_features').upsert(
    {
      school_id: schoolId,
      feature_code: code,
      is_enabled: enabled,
      override_reason: reason || null,
    },
    { onConflict: 'school_id,feature_code' },
  );
  if (error) throw error;

  await auditPlatform(userId, {
    action: enabled ? 'platform.feature_enable' : 'platform.feature_disable',
    module: 'platform',
    entityType: 'school',
    entityId: schoolId,
    schoolId,
    after: { feature: code, enabled, reason: reason || null },
  });
}
