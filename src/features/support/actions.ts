'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { createRequest, replyFromSchool } from '@/services/platform-requests';

/** « Contacter la plateforme » : nouvelle demande, ou suite d'une demande (lot 5). */
export async function createRequestAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const id = await createRequest(ctx, fd.get('subject'), fd.get('body'));
    redirect(`/e/${slug}/plateforme/${id}?envoye=1`);
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}

export async function replyRequestAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await replyFromSchool(ctx, id, fd.get('body'));
    redirect(`/e/${slug}/plateforme/${id}?envoye=1`);
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}
