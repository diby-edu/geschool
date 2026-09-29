'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { groupSchema } from './schemas';
import { createGroup, updateGroup, deleteGroup, setGroupMembers } from './service';

function parseGroup(fd: FormData) {
  return groupSchema.parse({
    code: fd.get('code'),
    name: fd.get('name'),
    kind: fd.get('kind'),
    subjectId: fd.get('subjectId') ?? '',
    maxSize: fd.get('maxSize') ?? '',
    classIds: fd.getAll('classIds').map(String).filter(Boolean),
  });
}

export async function createGroupAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
    const id = await createGroup(ctx, ctx.academicYear.id, parseGroup(fd));
    redirect(`/e/${slug}/groupes/${id}?cree=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function updateGroupAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateGroup(ctx, id, parseGroup(fd));
    redirect(`/e/${slug}/groupes/${id}?enregistre=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteGroupAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteGroup(ctx, id);
    redirect(`/e/${slug}/groupes?supprime=1`);
  });
}

/** La composition du groupe : les cases cochées deviennent la liste exacte. */
export async function setGroupMembersAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
    const studentIds = fd.getAll('studentIds').map(String).filter(Boolean);
    const { added, removed } = await setGroupMembers(ctx, id, ctx.academicYear.id, studentIds);
    redirect(`/e/${slug}/groupes/${id}?ajoutes=${added}&retires=${removed}`);
  });
}
