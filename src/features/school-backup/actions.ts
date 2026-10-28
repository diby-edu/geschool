'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { requirePermission, requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import { BACKUP_CATEGORIES } from './catalog';

/**
 * Sauvegardes de l'école (0156) : faire une sauvegarde, en remettre une.
 * Le travail lui-même est fait par le worker (minutes pour une grande école).
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export async function createBackupAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'backup.manage');
    const scope = fd.get('scope') === 'YEAR' ? 'YEAR' : 'SCHOOL';
    const yearId = scope === 'YEAR' ? String(fd.get('yearId') ?? '') : null;
    if (scope === 'YEAR' && !yearId) throw new ValidationError('Choisissez l’année à sauvegarder.');
    const svc = await import('@/services/school-backup');
    if (await svc.busy(ctx.school.id)) throw new ConflictError('Une sauvegarde ou une remise est déjà en cours pour l’école. Attendez qu’elle se termine.');
    const id = await svc.createBackupRow({ schoolId: ctx.school.id, scope, yearId, trigger: 'MANUAL', userId: ctx.user.id });
    const { enqueue } = await import('@/services/job-queue');
    await enqueue({ name: 'school-backup', data: { id } });
    await audit(ctx, { action: 'backup.create', module: 'backup', entityType: 'school_backup', entityId: id, after: { scope, yearId } });
    redirect(`/e/${slug}/sauvegardes?lancee=1`);
  });
}

/** Remettre une sauvegarde : tout, ou les catégories cochées. Confirmation par le nom de l'école. */
export async function restoreBackupAction(slug: string, backupId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, 'backup.restore');
    const all = fd.get('mode') === 'ALL';
    const categories = all ? BACKUP_CATEGORIES.map((c) => c.key) : fd.getAll('category').map(String).filter((k) => BACKUP_CATEGORIES.some((c) => c.key === k));
    if (categories.length === 0) throw new ValidationError('Cochez au moins une catégorie à remettre.');
    if (norm(String(fd.get('confirm') ?? '')) !== norm(ctx.school.name)) {
      throw new ValidationError('Pour confirmer, tapez exactement le nom de l’école.');
    }
    const svc = await import('@/services/school-backup');
    if (!(await svc.backupFilePath(ctx.school.id, backupId))) throw new ValidationError('Cette sauvegarde n’est plus disponible sur le serveur.');
    if (await svc.busy(ctx.school.id)) throw new ConflictError('Une sauvegarde ou une remise est déjà en cours pour l’école. Attendez qu’elle se termine.');
    const id = await svc.createRestoreRow({ schoolId: ctx.school.id, backupId, categories, userId: ctx.user.id });
    const { enqueue } = await import('@/services/job-queue');
    await enqueue({ name: 'school-restore', data: { id } });
    await audit(ctx, { action: 'backup.restore', module: 'backup', entityType: 'school_backup', entityId: id, after: { backupId, categories } });
    const { notifyPlatformOfRestore } = await import('@/services/platform-alerts');
    await notifyPlatformOfRestore(ctx.school.name, ctx.user.displayName, all ? 'tout' : categories.join(', ')).catch(() => undefined);
    redirect(`/e/${slug}/sauvegardes?remise=1`);
  });
}
