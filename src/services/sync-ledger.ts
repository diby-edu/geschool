import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Registre d'idempotence des opérations hors ligne (ADR-009, table
 * `sync_operations`). Sa policy d'insertion est `with check (false)` : aucun
 * client authentifié ne peut l'écrire directement — seule cette couche service,
 * en service_role, le fait après que l'endpoint a vérifié les barrières. Cela
 * empêche un client de contourner la déduplication ou le contrôle de périmètre.
 */

export type SyncResult = { registerId?: string; savedCount?: number; submitted?: boolean };

/** Résultat mémorisé d'une opération déjà appliquée, ou null si inédite. */
export async function getAppliedSyncResult(schoolId: string, clientOperationId: string): Promise<SyncResult | null> {
  const admin = createAdminClient('sync.apply');
  const { data } = await admin
    .from('sync_operations')
    .select('status, result')
    .eq('school_id', schoolId)
    .eq('client_operation_id', clientOperationId)
    .maybeSingle();
  if (data && data.status === 'APPLIED') return (data.result ?? {}) as SyncResult;
  return null;
}

/** Journalise une opération appliquée (upsert idempotent sur la clé cliente). */
export async function recordAppliedSyncOperation(input: {
  schoolId: string;
  userId: string;
  clientOperationId: string;
  operationType: string;
  payload: Record<string, unknown>;
  result: SyncResult;
}): Promise<void> {
  const admin = createAdminClient('sync.apply');
  await admin.from('sync_operations').upsert(
    {
      school_id: input.schoolId,
      user_id: input.userId,
      client_operation_id: input.clientOperationId,
      operation_type: input.operationType,
      payload: input.payload as Record<string, never>,
      status: 'APPLIED',
      result: input.result as Record<string, never>,
      applied_at: new Date().toISOString(),
    },
    { onConflict: 'school_id,client_operation_id' },
  );
}
