import 'server-only';

import { getSmsProvider } from '@/lib/sms';

/**
 * Le crédit restant chez l'opérateur.
 *
 * Lecture en direct, sans rien stocker : un solde recopié en base serait faux
 * dès le premier envoi. L'écran s'affiche même si l'opérateur ne répond pas —
 * un solde inconnu ne doit pas empêcher de régler le prix du SMS.
 */
export async function smsBalance(): Promise<number | null> {
  const provider = getSmsProvider() as { balance?: () => Promise<number | null> };
  if (typeof provider.balance !== 'function') return null;
  try {
    return await provider.balance();
  } catch {
    return null;
  }
}
