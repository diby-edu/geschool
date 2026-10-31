import { NextResponse } from 'next/server';
import { ipnHashValid } from '@/lib/paydunya';
import { checkOnlinePayment, paymentIdForToken } from '@/services/online-payments';

/**
 * IPN PayDunya (0157) : PayDunya prévient qu'un paiement a changé d'état.
 *
 * Le message est en `application/x-www-form-urlencoded`, sous la clé `data`
 * (en JSON, ou en champs « data[hash] », « data[invoice][token] »…). On ne le
 * croit pas sur parole : on vérifie qu'il vient de PayDunya (hash = SHA-512 de
 * la clé principale), puis on REDEMANDE le statut à PayDunya — c'est cette
 * lecture, et elle seule, qui confirme un paiement.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readData(form: FormData): { hash: string | null; token: string | null } {
  const raw = form.get('data');
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const d = JSON.parse(raw) as { hash?: string; invoice?: { token?: string } };
      return { hash: d.hash ?? null, token: d.invoice?.token ?? null };
    } catch {
      return { hash: null, token: null };
    }
  }
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : null;
  };
  return { hash: get('data[hash]'), token: get('data[invoice][token]') };
}

export async function POST(req: Request) {
  let data: { hash: string | null; token: string | null };
  try {
    data = readData(await req.formData());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!ipnHashValid(data.hash) || !data.token) return NextResponse.json({ ok: false }, { status: 403 });
  const paymentId = await paymentIdForToken(data.token);
  if (!paymentId) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const state = await checkOnlinePayment(paymentId);
    return NextResponse.json({ ok: true, status: state.status });
  } catch {
    // PayDunya renverra son message ; le worker revérifie de toute façon.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
