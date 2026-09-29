'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { classBatchSchema, classSchema } from './schemas';
import { createClass, createClasses, updateClass, deleteClass, setClassStatus, bulkClassAction } from './service';

const withValues =
  (fd: FormData) =>
  (s: FormState): FormState =>
    s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s;

function parse(fd: FormData) {
  return classSchema.parse({
    levelId: fd.get('levelId'),
    code: fd.get('code'),
    name: fd.get('name'),
    capacity: fd.get('capacity') ?? 0,
    headTeacherId: fd.get('headTeacherId') ?? '',
    mainRoomId: fd.get('mainRoomId') ?? '',
  });
}

export async function createClassAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createClass(ctx, parse(fd));
    redirect(`/e/${slug}/classes?created=1`);
  }).then(withValues(fd));
}

export async function updateClassAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateClass(ctx, id, parse(fd));
    redirect(`/e/${slug}/classes?updated=1`);
  }).then(withValues(fd));
}

export async function deleteClassAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteClass(ctx, id);
    redirect(`/e/${slug}/classes?deleted=1`);
  });
}

/** Création d'une classe ou d'une série depuis un niveau (écran « Nouvelle classe »). */
export async function createClassesAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const n = await createClasses(
      ctx,
      classBatchSchema.parse({
        levelId: fd.get('levelId'),
        mode: fd.get('mode') ?? 'ONE',
        suffix: fd.get('suffix') ?? '',
        count: fd.get('count') ?? 1,
        numbering: fd.get('numbering') ?? 'DIGITS',
        capacity: fd.get('capacity') ?? 0,
        headTeacherId: fd.get('headTeacherId') ?? '',
        mainRoomId: fd.get('mainRoomId') ?? '',
      }),
    );
    redirect(`/e/${slug}/classes?creees=${n}`);
  }).then(withValues(fd));
}

/** Archive une classe (elle quitte les listes) ou la rétablit. */
export async function setClassStatusAction(
  slug: string,
  id: string,
  status: 'ACTIVE' | 'ARCHIVED',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setClassStatus(ctx, id, status);
    redirect(`/e/${slug}/classes?${status === 'ARCHIVED' ? 'archivee=1' : 'retablie=1'}`);
  });
}

/** Archiver, rétablir ou supprimer les classes cochées sur la page affichée. */
export async function bulkClassesAction(
  slug: string,
  action: 'archive' | 'restore' | 'delete',
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await bulkClassAction(ctx, fd.getAll('ids').map(String), action);
    const params = new URLSearchParams({ lot: action, faites: String(r.done) });
    if (r.skipped > 0) params.set('ignorees', String(r.skipped));
    if (r.reason) params.set('motif', r.reason);
    if (action !== 'archive') params.set('corbeille', '1');
    redirect(`/e/${slug}/classes?${params.toString()}`);
  });
}
