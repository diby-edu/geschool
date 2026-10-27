'use server';

import { redirect } from 'next/navigation';
import { runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { founderPhone, recipientsOf, sendPlatformMessage } from '@/services/platform-messages';
import { readSenderForSchool } from '@/features/sms/platform';
import { countSms, toGsm } from '@/lib/sms/text';
import { requireAdmin } from './admin';
import { parseDraft, targetSchools } from './messages';

export type MessagePreview = { schools: number; schoolNames: string[]; persons: number; sms: number; smsCost: number; key: string };
export type MessageFormState = FormState & { preview?: MessagePreview };

/**
 * Écrire aux écoles (lot 5). En deux temps : d'abord le compte (combien de
 * personnes, combien de SMS et leur prix), puis l'envoi confirmé.
 */
export async function sendPlatformMessageAction(_p: MessageFormState, fd: FormData): Promise<MessageFormState> {
  let preview: MessagePreview | undefined;
  const state = await runFormAction(async () => {
    const { userId } = await requireAdmin();
    const draft = parseDraft(fd);
    const schools = await targetSchools(draft);
    if (schools.length === 0) throw new ValidationError('Aucune école ne correspond à ce choix.');
    const sms = await readSenderForSchool();

    // L'envoi confirmé doit porter sur EXACTEMENT ce qui a été compté.
    const key = [draft.target, schools.map((s) => s.id).sort().join(','), [...draft.audience].sort().join(','), draft.smsToFounder].join('|');

    if (fd.get('confirm') !== 'oui') {
      let persons = 0;
      let phones = 0;
      for (const s of schools) {
        persons += (await recipientsOf(s.id, draft.audience)).length;
        if (draft.smsToFounder && (await founderPhone(s.id))) phones++;
      }
      // Même texte que celui qui partira (services/platform-messages.ts).
      const parts = Math.max(1, countSms(toGsm(`${draft.title}. ${draft.body}`.slice(0, 300))).parts);
      preview = { schools: schools.length, schoolNames: schools.slice(0, 6).map((s) => s.name), key, persons, sms: phones, smsCost: Math.round(phones * parts * sms.pricePerSms) };
      return;
    }

    if (fd.get('previewKey') !== key) {
      throw new ValidationError('Le choix des écoles ou des personnes a changé depuis le compte : recomptez avant d’envoyer.');
    }
    const sent = await sendPlatformMessage(userId, draft, schools, { sender: sms.fallbackSender, pricePerSms: sms.pricePerSms });
    await auditPlatform(userId, {
      action: 'platform.message_send',
      module: 'platform',
      entityType: 'platform_message',
      entityId: sent.id,
      after: { title: draft.title, schools: schools.length, recipients: sent.recipients, sms: sent.smsSent },
    });
    redirect(`/admin/messages/${sent.id}?envoye=1`);
  });
  return preview ? { preview } : state;
}
