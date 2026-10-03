import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSmsProvider } from '@/lib/sms';
import { countSms, toGsm } from '@/lib/sms/text';

/**
 * Envoyer un SMS, et en garder trace.
 *
 * Tout passe par ici : on nettoie le texte, on compte ce qu'il coûtera, on
 * envoie, et on écrit la ligne — réussite comme échec. Un SMS qui part sans
 * laisser de trace est un SMS dont on ne saura jamais s'il est arrivé, et dont
 * on ne pourra pas justifier la facture.
 *
 * Service : le journal est posé par le système, jamais par un utilisateur, et
 * aucune politique d'écriture n'existe sur la table (migration 0089).
 */

export type SendSmsInput = {
  schoolId: string | null;
  to: string;
  body: string;
  sender: string;
  /** À quoi sert ce message : identifiants, code de connexion, essai… */
  kind?: string;
  createdBy?: string | null;
  /** Prix unitaire, pour chiffrer la ligne. */
  pricePerSms?: number;
  /**
   * Nettoyer le texte des caractères qui doublent le coût. Vrai par défaut :
   * un « — » bien placé fait payer deux fois le même message.
   */
  clean?: boolean;
};

export type SendSmsOutcome = {
  ok: boolean;
  id: string | null;
  parts: number;
  cost: number | null;
  error?: string;
  permanent?: boolean;
};

export async function sendAndLog(input: SendSmsInput): Promise<SendSmsOutcome> {
  const texte = input.clean === false ? input.body : toGsm(input.body);
  const compte = countSms(texte);
  const reference = crypto.randomUUID();
  const provider = getSmsProvider();
  const prix = input.pricePerSms ?? null;
  const cout = prix === null ? null : Math.round(prix * compte.parts * 100) / 100;

  const resultat = await provider.send({ to: input.to, body: texte, reference });

  const admin = createAdminClient('notifications.send');
  const ligne = {
    school_id: input.schoolId,
    to_e164: input.to,
    body: texte,
    sender: input.sender,
    provider: provider.name,
    provider_message_id: resultat.ok ? resultat.providerMessageId : null,
    status: resultat.ok ? ('SENT' as const) : ('FAILED' as const),
    parts: Math.max(1, compte.parts),
    cost: cout,
    error_code: resultat.ok ? null : resultat.errorCode,
    error_message: resultat.ok ? null : resultat.errorMessage,
    permanent_failure: resultat.ok ? false : resultat.permanent,
    reference,
    kind: input.kind ?? 'CREDENTIALS',
    created_by: input.createdBy ?? null,
  };

  const { data, error } = await admin.from('sms_messages').insert(ligne).select('id').single();
  if (error) {
    // Le message est peut-être parti : on ne fait pas échouer l'appel pour un
    // journal qui refuse la ligne, mais on le dit fort.
    console.error('[sms] message envoyé mais non journalisé :', error.message);
  }

  return resultat.ok
    ? { ok: true, id: data?.id ?? null, parts: ligne.parts, cost: cout }
    : {
        ok: false,
        id: data?.id ?? null,
        parts: ligne.parts,
        cost: cout,
        error: resultat.errorMessage,
        permanent: resultat.permanent,
      };
}

/**
 * Demander à l'opérateur où en sont les messages encore en attente.
 *
 * Remplace l'accusé de réception tant que l'application n'a pas d'adresse
 * publique à lui donner. On ne rattrape que les envois récents : au-delà, un
 * message qui n'est pas arrivé ne reviendra plus.
 */
export async function refreshPendingStatuses(limit = 50): Promise<{ checked: number; delivered: number; failed: number }> {
  const provider = getSmsProvider() as { name: string; status?: (id: string) => Promise<string | null> };
  if (typeof provider.status !== 'function') return { checked: 0, delivered: 0, failed: 0 };

  const admin = createAdminClient('notifications.send');
  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await admin
    .from('sms_messages')
    .select('id, provider_message_id')
    .eq('status', 'SENT')
    .eq('provider', provider.name)
    .not('provider_message_id', 'is', null)
    .gte('created_at', depuis)
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  for (const m of (data ?? []) as { id: string; provider_message_id: string }[]) {
    const etat = await provider.status(m.provider_message_id);
    if (etat === 'DELIVERED') {
      await admin
        .from('sms_messages')
        .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
        .eq('id', m.id);
      delivered++;
    } else if (etat === 'FAILED') {
      await admin.from('sms_messages').update({ status: 'FAILED', error_code: 'DLR_FAILED' }).eq('id', m.id);
      failed++;
    }
  }
  return { checked: (data ?? []).length, delivered, failed };
}
