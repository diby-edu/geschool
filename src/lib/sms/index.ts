import 'server-only';

import { serverEnv } from '@/lib/env';
import { letextoFromEnv } from './letexto';

/**
 * Abstraction SMS (additif comptes §20). Le cœur du SaaS ne connait que
 * l'interface ; le fournisseur reel se branche par variable d'environnement.
 * Le SMS ne sert QU'A transmettre les identifiants d'acces (ADR-010).
 */
export type SmsMessage = { to: string; body: string; reference: string };
export type SmsResult =
  | { ok: true; provider: string; providerMessageId: string | null }
  | { ok: false; provider: string; errorCode: string; errorMessage: string; permanent: boolean };

export interface SmsProvider {
  readonly name: string;
  send(msg: SmsMessage): Promise<SmsResult>;
}

/**
 * Fournisseur de developpement : n'envoie rien, journalise le message. Permet
 * de dérouler tout le flux d'acces en local sans passerelle ni cout, et de
 * lire le mot de passe temporaire dans les logs du serveur.
 */
class ConsoleProvider implements SmsProvider {
  readonly name = 'console';
  async send(msg: SmsMessage): Promise<SmsResult> {
    console.warn(`[sms:console] -> ${msg.to}\n${msg.body}\n(ref ${msg.reference})`);
    return { ok: true, provider: this.name, providerMessageId: `console-${msg.reference}` };
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const provider = serverEnv().SMS_PROVIDER;
  switch (provider) {
    case 'letexto': {
      const letexto = letextoFromEnv();
      if (letexto) {
        cached = letexto;
        return cached;
      }
      // Choisi mais pas configure : on le DIT, puis on retombe sur la console.
      // Un envoi visible en logs vaut mieux qu'un echec muet.
      console.warn('[sms] SMS_PROVIDER=letexto mais aucune cle API : retour au mode console.');
      cached = new ConsoleProvider();
      return cached;
    }
    // Les autres adaptateurs (orange_ci, twilio) se branchent ici.
    case 'console':
    default:
      cached = new ConsoleProvider();
      return cached;
  }
}

/**
 * Mot de passe temporaire : court, lisible au telephone, sans caracteres
 * ambigus (ni 0/O, ni 1/I/l). Genere au moment de l'envoi et jamais stocke
 * (ADR-006).
 */
export function generateTempPassword(length = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
