'use server';

import { redirect } from 'next/navigation';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { closeRequest, replyFromPlatform } from '@/services/platform-requests';
import { requireAdmin } from './admin';

/** Répondre à une école, ou terminer sa demande (lot 5). */
export async function replyPlatformRequestAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const { schoolId } = await replyFromPlatform(userId, id, fd.get('body'));
    await auditPlatform(userId, { schoolId, action: 'platform.request_reply', module: 'platform', entityType: 'platform_request', entityId: id });
    redirect(`/admin/demandes/${id}?repondu=1`);
  }).then((state) => (state.error ? { ...state, values: formValues(fd) } : state));
}

export async function closePlatformRequestAction(id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const { schoolId } = await closeRequest(id);
    await auditPlatform(userId, { schoolId, action: 'platform.request_close', module: 'platform', entityType: 'platform_request', entityId: id });
    redirect('/admin/demandes?termine=1');
  });
}
