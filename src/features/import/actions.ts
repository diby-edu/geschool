'use server';

import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant/context';
import { isAppError } from '@/lib/errors';
import { CSV_MAX_ROWS } from '@/lib/csv-parse';
import { isImportKind } from './kinds';
import { importRows, previewImport } from './service';
import type { ImportPreview, RowOutcome } from './types';

/**
 * Actions de l'écran Import / export. Le navigateur lit le fichier et envoie les
 * cellules brutes ; tout est revérifié ici (service.ts). Tailles bornées : un
 * lot d'import reste petit (chaque élève crée un compte parent).
 */

const cells = z.array(z.string().max(500)).max(60);
const header = cells;
const rows = (max: number) => z.array(z.object({ line: z.number().int().positive(), cells })).max(max);

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (isAppError(error)) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: 'Fichier trop volumineux ou illisible.' };
  console.error('[import]', error);
  return { ok: false, error: 'Erreur inattendue. Réessayez.' };
}

export async function previewImportAction(
  slug: string,
  kind: string,
  rawHeader: unknown,
  rawRows: unknown,
): Promise<Result<ImportPreview>> {
  try {
    if (!isImportKind(kind)) return { ok: false, error: 'Liste inconnue.' };
    const ctx = await getTenantContext(slug);
    const data = await previewImport(ctx, kind, header.parse(rawHeader), rows(CSV_MAX_ROWS).parse(rawRows));
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function importBatchAction(
  slug: string,
  kind: string,
  rawHeader: unknown,
  rawRows: unknown,
): Promise<Result<RowOutcome[]>> {
  try {
    if (!isImportKind(kind)) return { ok: false, error: 'Liste inconnue.' };
    const ctx = await getTenantContext(slug);
    const data = await importRows(ctx, kind, header.parse(rawHeader), rows(100).parse(rawRows));
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}
