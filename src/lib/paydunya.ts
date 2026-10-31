import 'server-only';

import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * PayDunya, API « Checkout » (HTTP/JSON) — https://developers.paydunya.com/doc/FR/http_json
 *
 * Trois choses seulement : créer une facture (l'école est envoyée sur sa page
 * de paiement), demander son statut, et reconnaître un message (IPN) venant
 * vraiment de PayDunya. Le statut lu par `confirmInvoice` est la SEULE preuve
 * de paiement : le retour du navigateur et l'IPN ne font que déclencher la lecture.
 */

const BASE = { test: 'https://app.paydunya.com/sandbox-api/v1', live: 'https://app.paydunya.com/api/v1' } as const;

export function paydunyaConfigured(): boolean {
  const e = serverEnv();
  return Boolean(e.PAYDUNYA_MASTER_KEY && e.PAYDUNYA_PRIVATE_KEY && e.PAYDUNYA_TOKEN);
}

function headers(): Record<string, string> {
  const e = serverEnv();
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': e.PAYDUNYA_MASTER_KEY,
    'PAYDUNYA-PRIVATE-KEY': e.PAYDUNYA_PRIVATE_KEY,
    'PAYDUNYA-TOKEN': e.PAYDUNYA_TOKEN,
  };
}

const base = () => BASE[serverEnv().PAYDUNYA_MODE];

export type InvoiceItem = { name: string; quantity: number; unitPrice: number; description?: string };

export async function createInvoice(input: {
  total: number;
  description: string;
  items: InvoiceItem[];
  storeName: string;
  customData: Record<string, string>;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}): Promise<{ token: string; url: string }> {
  const items = Object.fromEntries(
    input.items.map((it, i) => [
      `item_${i}`,
      { name: it.name, quantity: it.quantity, unit_price: String(it.unitPrice), total_price: String(it.unitPrice * it.quantity), description: it.description ?? '' },
    ]),
  );
  const res = await fetch(`${base()}/checkout-invoice/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      invoice: { total_amount: input.total, description: input.description, items },
      store: { name: input.storeName },
      custom_data: input.customData,
      actions: { return_url: input.returnUrl, cancel_url: input.cancelUrl, callback_url: input.callbackUrl },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const r = (await res.json().catch(() => ({}))) as { response_code?: string; response_text?: string; token?: string; description?: string };
  if (r.response_code !== '00' || !r.token || !r.response_text) {
    throw new Error(`PayDunya a refusé la facture : ${r.description || r.response_text || `HTTP ${res.status}`}`);
  }
  return { token: r.token, url: r.response_text };
}

export type InvoiceStatus = {
  status: 'pending' | 'completed' | 'cancelled' | 'failed' | 'unknown';
  total: number | null;
  customData: Record<string, string>;
  receiptUrl: string | null;
  failReason: string | null;
  customer: { name?: string; phone?: string } | null;
  raw: Record<string, unknown>;
};

export async function confirmInvoice(token: string): Promise<InvoiceStatus> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(token)) throw new Error('Jeton PayDunya invalide.');
  const res = await fetch(`${base()}/checkout-invoice/confirm/${token}`, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  const r = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const status = String(r.status ?? '').toLowerCase();
  const invoice = (r.invoice ?? {}) as { total_amount?: number | string };
  return {
    status: (['pending', 'completed', 'cancelled', 'failed'].includes(status) ? status : 'unknown') as InvoiceStatus['status'],
    total: invoice.total_amount === undefined ? null : Number(invoice.total_amount),
    customData: (r.custom_data ?? {}) as Record<string, string>,
    receiptUrl: typeof r.receipt_url === 'string' ? r.receipt_url : null,
    failReason: typeof r.fail_reason === 'string' ? r.fail_reason : null,
    customer: (r.customer ?? null) as InvoiceStatus['customer'],
    raw: r,
  };
}

/** Le hash d'un IPN : SHA-512 de la clé principale. Comparaison à temps constant. */
export function ipnHashValid(hash: string | null | undefined): boolean {
  if (!hash) return false;
  const expected = crypto.createHash('sha512').update(serverEnv().PAYDUNYA_MASTER_KEY).digest('hex');
  const got = hash.trim().toLowerCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
