import 'server-only';

import { serverEnv } from '@/lib/env';
import type { SmsMessage, SmsProvider, SmsResult } from './index';
import { toLocalDialing } from './text';

/**
 * Letexto (éditeur Arolitec) — l'opérateur SMS de la plateforme.
 *
 * API vérifiée sur sa documentation :
 *   POST {base}/v1/messages/send
 *   Authorization: Bearer <clé>, Content-Type: application/json
 *   { content, from, to, dlrUrl?, dlrMethod?, customData? }
 *
 * Deux détails qui comptent :
 *   * le numéro part SANS le « + » — « 2250747094746 » et non « +225… » ;
 *   * le `customData` porte notre propre référence, pour recoller le rapport
 *     de livraison au message quand il reviendra.
 *
 * Le rapport de livraison (`dlrUrl`) exige une adresse publique : il n'est
 * donc renseigné qu'une fois l'application en ligne. En local, l'envoi marche,
 * les accusés non.
 */

const DEFAULT_BASE = 'https://apis.letexto.com';
/** Au-delà, mieux vaut une erreur claire qu'une page qui ne répond plus. */
const TIMEOUT_MS = 15_000;

export class LetextoProvider implements SmsProvider {
  readonly name = 'letexto';

  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
    private readonly baseUrl: string,
    private readonly dlrUrl: string | null,
  ) {}

  async send(msg: SmsMessage): Promise<SmsResult> {
    if (!this.apiKey) {
      return erreur(this.name, 'NO_API_KEY', 'Aucune clé API Letexto configurée (LETEXTO_API_KEY).', true);
    }
    if (!this.sender) {
      return erreur(this.name, 'NO_SENDER', 'Aucun nom d’expéditeur configuré (LETEXTO_SENDER).', true);
    }

    const corps: Record<string, unknown> = {
      content: msg.body,
      from: this.sender,
      to: toLocalDialing(msg.to),
      customData: msg.reference,
    };
    if (this.dlrUrl) {
      corps.dlrUrl = this.dlrUrl;
      corps.dlrMethod = 'POST';
    }

    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let reponse: Response;
    try {
      reponse = await fetch(`${this.baseUrl}/v1/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(corps),
        signal,
      });
    } catch (e) {
      // Réseau coupé, DNS, délai dépassé : rien n'est perdu définitivement,
      // le message pourra repartir.
      const message = e instanceof Error ? e.message : String(e);
      return erreur(this.name, 'NETWORK', `Letexto injoignable : ${message}`, false);
    }

    const texte = await reponse.text();
    const data = lireJson(texte);

    if (!reponse.ok) {
      // 4xx : la demande elle-même est fautive (clé, numéro, sender refusé).
      // Réessayer ne changerait rien — sauf pour 408 et 429, qui passent.
      const permanent = reponse.status >= 400 && reponse.status < 500 && ![408, 429].includes(reponse.status);
      return erreur(
        this.name,
        `HTTP_${reponse.status}`,
        messageDErreur(data) ?? texte.slice(0, 300) ?? reponse.statusText,
        permanent,
      );
    }

    return { ok: true, provider: this.name, providerMessageId: extraireId(data) };
  }

  /**
   * L'état d'un message déjà parti : PENDING, SENT, DELIVERED ou FAILED.
   *
   * Utile tant que les accusés de réception ne peuvent pas nous être poussés
   * (ils exigent une adresse publique) : on interroge au lieu d'attendre.
   */
  async status(providerMessageId: string): Promise<string | null> {
    const data = await this.lire(`/v1/messages/${encodeURIComponent(providerMessageId)}/status`);
    const v = data?.status;
    return typeof v === 'string' ? v : null;
  }

  /** Le crédit restant, pour alerter avant la panne sèche. */
  async balance(): Promise<number | null> {
    const data = await this.lire('/v1/users/balance');
    const v = data?.balance;
    return typeof v === 'number' ? v : null;
  }

  private async lire(chemin: string): Promise<Record<string, unknown> | null> {
    if (!this.apiKey) return null;
    try {
      const r = await fetch(`${this.baseUrl}${chemin}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) return null;
      return lireJson(await r.text());
    } catch {
      // Une lecture d'état qui échoue ne doit jamais faire tomber l'écran qui
      // l'affiche : on rend « inconnu ».
      return null;
    }
  }
}

/** Construit le fournisseur depuis l'environnement, ou `null` s'il n'est pas configuré. */
export function letextoFromEnv(): LetextoProvider | null {
  const env = serverEnv() as unknown as Record<string, string | undefined>;
  const apiKey = env.LETEXTO_API_KEY || env.SMS_API_KEY || '';
  const sender = env.LETEXTO_SENDER || env.SMS_SENDER_ID || '';
  if (!apiKey) return null;
  const base = (env.LETEXTO_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const dlr = env.SMS_DLR_URL || null;
  return new LetextoProvider(apiKey, sender, base, dlr);
}

function erreur(provider: string, code: string, message: string, permanent: boolean): SmsResult {
  return { ok: false, provider, errorCode: code, errorMessage: message, permanent };
}

function lireJson(texte: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(texte);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * L'identifiant du message, pour recoller le rapport de livraison. La
 * documentation ne fixe pas le nom du champ : on essaie les plus courants
 * plutôt que de perdre l'identifiant.
 */
function extraireId(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const candidats = [data.id, data.messageId, data.message_id, (data.data as Record<string, unknown> | undefined)?.id];
  for (const c of candidats) if (typeof c === 'string' && c) return c;
  return null;
}

function messageDErreur(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  for (const clef of ['message', 'error', 'detail', 'description']) {
    const v = data[clef];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}
