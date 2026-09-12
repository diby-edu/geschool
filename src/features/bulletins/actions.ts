'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { generateForClass } from './generate';
import { validateBulletins, publishBulletins, unpublishBulletins } from './workflow';

function requireSelection(classId: string, periodId: string): void {
  if (!classId || !periodId) throw new ValidationError('Choisissez une classe et une période.');
}

export async function generateBulletinsAction(slug: string, classId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireSelection(classId, periodId);
    const { generated } = await generateForClass(ctx, classId, periodId);
    redirect(`/e/${slug}/bulletins?class=${classId}&period=${periodId}&generated=${generated}`);
  });
}

export async function validateBulletinsAction(slug: string, classId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const n = await validateBulletins(ctx, classId, periodId);
    redirect(`/e/${slug}/bulletins?class=${classId}&period=${periodId}&validated=${n}`);
  });
}

export async function publishBulletinsAction(slug: string, classId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const n = await publishBulletins(ctx, classId, periodId);
    redirect(`/e/${slug}/bulletins?class=${classId}&period=${periodId}&published=${n}`);
  });
}

export async function unpublishBulletinsAction(slug: string, classId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const n = await unpublishBulletins(ctx, classId, periodId);
    redirect(`/e/${slug}/bulletins?class=${classId}&period=${periodId}&unpublished=${n}`);
  });
}
