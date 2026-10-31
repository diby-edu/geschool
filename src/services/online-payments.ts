import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv } from '@/lib/env';
import { confirmInvoice, createInvoice, paydunyaConfigured, type InvoiceItem } from '@/lib/paydunya';
import { clean as normalizePlatformSms } from '@/features/sms/platform';

/**
 * Paiement en ligne (PayDunya, 0157), pour TOUT ce qu'une école paie : son
 * abonnement (modules) et ses packs de SMS. Les frais de PayDunya sont payés en
 * plus par l'école (taux réglé par la plateforme).
 *
 * Le montant est toujours calculé ICI, côté serveur, jamais reçu du navigateur.
 * Un paiement n'est confirmé qu'après lecture de son statut chez PayDunya, avec
 * le montant exact attendu (public.billing_settle_online, qui ne se rejoue pas).
 */

const admin = () => createAdminClient('billing.online');

export type SmsPack = { quantity: number; price: number };
export type OnlineOffer = { open: boolean; feePct: number; smsPacks: SmsPack[]; currency: string };

const DEFAULT_FEE_PCT = 3;
const DEFAULT_PACK_SIZES = [500, 1000, 5000];

/** Ce que la plateforme propose en ligne : ouvert ou non, taux des frais, packs de SMS. */
export async function readOnlineOffer(): Promise<OnlineOffer> {
  const db = admin();
  const [{ data: billing }, { data: sms }] = await Promise.all([
    db.from('platform_settings').select('settings').eq('namespace', 'billing').maybeSingle(),
    db.from('platform_settings').select('settings').eq('namespace', 'sms').maybeSingle(),
  ]);
  const o = (billing?.settings && typeof billing.settings === 'object' ? billing.settings : {}) as Record<string, unknown>;
  const pct = Number(o.onlineFeePct);
  const smsPrice = normalizePlatformSms(sms?.settings).pricePerSms;
  const packs = Array.isArray(o.smsPacks)
    ? (o.smsPacks as { quantity?: unknown; price?: unknown }[])
        .map((p) => ({ quantity: Math.round(Number(p.quantity)), price: Math.round(Number(p.price)) }))
        .filter((p) => p.quantity > 0 && p.quantity <= 100_000 && p.price > 0)
    : DEFAULT_PACK_SIZES.map((q) => ({ quantity: q, price: Math.round(q * smsPrice) }));
  return {
    open: paydunyaConfigured(),
    feePct: Number.isFinite(pct) && pct >= 0 && pct <= 20 ? pct : DEFAULT_FEE_PCT,
    smsPacks: packs.sort((a, b) => a.quantity - b.quantity),
    currency: 'XOF',
  };
}

/** Frais en francs entiers, arrondis au franc supérieur (on ne fait jamais payer moins que les frais). */
export const feeOf = (amount: number, pct: number) => Math.ceil((amount * pct) / 100);

export type StartInput = {
  schoolId: string;
  slug: string;
  userId: string;
  purpose: 'SUBSCRIPTION' | 'SMS_PACK' | 'PARENT_ACCESS';
  amount: number;
  description: string;
  items: InvoiceItem[];
  moduleIds?: string[];
  smsQuantity?: number;
  /** Espace Parent (0172) : les enfants débloqués à la confirmation. */
  studentIds?: string[];
  /** Abonnement (0172) : réduction gagnée par les élèves activés, déjà appliquée au montant. */
  discountPct?: number;
};

/** Crée le paiement « en attente » et la facture PayDunya ; renvoie l'adresse de la page de paiement. */
export async function startOnlinePayment(input: StartInput): Promise<{ paymentId: string; url: string }> {
  const offer = await readOnlineOffer();
  if (!offer.open) throw new Error('Le paiement en ligne n’est pas encore ouvert.');
  if (!(input.amount > 0)) throw new Error('Montant invalide.');
  const fee = feeOf(input.amount, offer.feePct);
  const db = admin();

  const { data: sub } = await db.from('subscriptions').select('id').eq('school_id', input.schoolId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: row, error } = await db
    .from('payments')
    .insert({
      school_id: input.schoolId,
      subscription_id: (sub as { id: string } | null)?.id ?? null,
      amount: input.amount,
      currency: offer.currency,
      method: 'MOBILE_MONEY',
      provider: 'paydunya',
      status: 'PENDING',
      recorded_by: input.userId,
      notes: input.description,
      purpose: input.purpose,
      module_ids: input.moduleIds ?? [],
      sms_quantity: input.smsQuantity ?? null,
      fee_amount: fee,
      ...(input.studentIds?.length ? { student_ids: input.studentIds } : {}),
      ...(input.discountPct ? { discount_pct: input.discountPct } : {}),
    } as never)
    .select('id')
    .single();
  if (error) throw error;
  const paymentId = (row as { id: string }).id;

  const app = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const back = `${app}/e/${input.slug}/paiement/${paymentId}`;
  const items = fee > 0 ? [...input.items, { name: `Frais de paiement en ligne (${offer.feePct} %)`, quantity: 1, unitPrice: fee }] : input.items;
  try {
    const { token, url } = await createInvoice({
      total: input.amount + fee,
      description: input.description,
      items,
      storeName: 'GESCHOOL',
      customData: { paymentId },
      returnUrl: back,
      cancelUrl: `${back}?annule=1`,
      callbackUrl: `${app}/api/paiements/ipn`,
    });
    await db.from('payments').update({ provider_reference: token, checkout_url: url, provider_status: 'pending' } as never).eq('id', paymentId);
    return { paymentId, url };
  } catch (e) {
    await db.rpc('billing_cancel_online' as never, { p_payment: paymentId, p_status: 'failed', p_reason: e instanceof Error ? e.message : 'Création impossible' } as never);
    throw e;
  }
}

export type OnlineState = { status: 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED'; receipt: string | null; reason: string | null };

/**
 * Lit le statut chez PayDunya et agit : confirmé (montant exact) → payé, modules
 * prolongés ou SMS ajoutés, reçu émis ; annulé ou échoué → clos. Sans effet sur
 * un paiement déjà traité. Appelé par l'IPN, la page de retour et le worker.
 */
export async function checkOnlinePayment(paymentId: string): Promise<OnlineState> {
  const db = admin();
  const { data } = await db.from('payments').select('id, status, provider, provider_reference, amount, fee_amount, notes').eq('id', paymentId).maybeSingle();
  const p = data as { id: string; status: string; provider: string | null; provider_reference: string | null; amount: number; fee_amount: number; notes: string | null } | null;
  if (!p || p.provider !== 'paydunya') throw new Error('Paiement en ligne introuvable.');
  const receipt = async () => {
    const { data: r } = await db.from('payment_receipts').select('number').eq('payment_id', paymentId).maybeSingle();
    return (r as { number: string } | null)?.number ?? null;
  };
  if (p.status === 'PAID') return { status: 'PAID', receipt: await receipt(), reason: null };
  if (p.status !== 'PENDING') return { status: p.status === 'FAILED' ? 'FAILED' : 'CANCELLED', receipt: null, reason: p.notes };
  if (!p.provider_reference) return { status: 'PENDING', receipt: null, reason: null };

  const s = await confirmInvoice(p.provider_reference);
  if (s.customData.paymentId && s.customData.paymentId !== paymentId) throw new Error('La facture PayDunya ne correspond pas à ce paiement.');
  if (s.status === 'completed') {
    const { data: number, error } = await db.rpc('billing_settle_online' as never, {
      p_payment: paymentId,
      p_paid_total: s.total,
      p_details: { receiptUrl: s.receiptUrl, customer: s.customer, mode: s.raw.mode ?? null },
    } as never);
    if (error) throw new Error(error.message);
    await announcePayment(paymentId, p.amount + (p.fee_amount ?? 0));
    return { status: 'PAID', receipt: (number as unknown as string) ?? null, reason: null };
  }
  if (s.status === 'cancelled' || s.status === 'failed') {
    await db.rpc('billing_cancel_online' as never, { p_payment: paymentId, p_status: s.status, p_reason: s.failReason ?? (s.status === 'cancelled' ? 'Paiement annulé' : 'Paiement refusé') } as never);
    return { status: s.status === 'failed' ? 'FAILED' : 'CANCELLED', receipt: null, reason: s.failReason };
  }
  return { status: 'PENDING', receipt: null, reason: null };
}

/**
 * Paiement en ligne réussi : l'école (ceux qui suivent l'abonnement) et le Super
 * Admin sont prévenus, dans la cloche et sur leur téléphone (0171).
 */
async function announcePayment(paymentId: string, total: number): Promise<void> {
  try {
    const { data } = await admin().from('payments').select('school_id, purpose, recorded_by, student_ids, schools(name)').eq('id', paymentId).maybeSingle();
    const row = data as unknown as { school_id: string; purpose: string | null; recorded_by: string | null; student_ids: string[] | null; schools: { name: string } | null } | null;
    if (!row) return;
    // Qui a payé, et pour quels élèves (Espace Parent) — demandé le 2026-10-31.
    const [{ data: u }, { data: kids }] = await Promise.all([
      row.recorded_by ? admin().from('users').select('first_name, last_name, display_name').eq('id', row.recorded_by).maybeSingle() : Promise.resolve({ data: null }),
      row.student_ids?.length
        ? admin().from('students').select('first_name, last_name, student_enrollments(status, classes(name))').in('id', row.student_ids)
        : Promise.resolve({ data: [] }),
    ]);
    const who = u ? [u.first_name, u.last_name?.toUpperCase()].filter(Boolean).join(' ') || u.display_name : null;
    const pour = ((kids ?? []) as unknown as { first_name: string; last_name: string; student_enrollments: { status: string; classes: { name: string } | null }[] }[])
      .map((k) => {
        const c = k.student_enrollments.find((e) => e.status === 'ENROLLED')?.classes?.name;
        return `${k.last_name.toUpperCase()} ${k.first_name}${c ? ` (${c})` : ''}`;
      })
      .join(', ');
    const montant = `${Math.round(total).toLocaleString('fr-FR')} F`;
    const objet = row.purpose === 'SMS_PACK' ? 'achat de SMS' : row.purpose === 'PARENT_ACCESS' ? 'Espace Parent, payé par un parent' : 'abonnement';
    const { notifyPermission, notifyPlatform } = await import('./notifications');
    // L'Espace Parent est payé par un parent : l'école n'a rien reçu ni payé.
    if (row.purpose !== 'PARENT_ACCESS') await notifyPermission(row.school_id, ['billing.view'], {
      type: 'billing.payment',
      title: 'Paiement reçu',
      body: `${montant} en ligne (${objet}). Le reçu est disponible.`,
      entityType: 'payment',
      entityId: paymentId,
    });
    await notifyPlatform({
      type: 'platform.payment',
      title: 'Paiement reçu',
      body: `${row.schools?.name ?? 'Une école'} — ${montant} en ligne (${objet})${who ? `, payé par ${who}` : ''}${pour ? ` pour ${pour}` : ''}.`,
      href: `/admin/facturation/${row.school_id}`,
      schoolId: row.school_id,
      entityType: 'payment',
      entityId: paymentId,
    });
  } catch (error) {
    console.error('[paiement] notification impossible', error);
  }
}

/** Un paiement, pour la personne qui l'a fait (parent, Espace Parent) : null sinon. */
export async function paymentOfPayer(paymentId: string, userId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin()
    .from('payments')
    .select('id, school_id, amount, fee_amount, purpose, sms_quantity, notes, checkout_url, student_ids, recorded_by')
    .eq('id', paymentId)
    .maybeSingle();
  const row = data as unknown as { recorded_by: string | null } | null;
  return row && row.recorded_by === userId ? (row as unknown as Record<string, unknown>) : null;
}

/** Le paiement correspondant à un jeton PayDunya (IPN). */
export async function paymentIdForToken(token: string): Promise<string | null> {
  const { data } = await admin().from('payments').select('id').eq('provider', 'paydunya').eq('provider_reference', token).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Filet de sécurité (worker, toutes les 15 min) : un IPN perdu ne laisse jamais un paiement en attente. */
export async function recheckPendingPayments(): Promise<{ checked: number; paid: number; closed: number }> {
  const { data } = await admin()
    .from('payments')
    .select('id')
    .eq('provider', 'paydunya')
    .eq('status', 'PENDING')
    .gt('created_at', new Date(Date.now() - 48 * 3_600_000).toISOString())
    .limit(100);
  let paid = 0;
  let closed = 0;
  const rows = (data ?? []) as { id: string }[];
  for (const r of rows) {
    try {
      const s = await checkOnlinePayment(r.id);
      if (s.status === 'PAID') paid++;
      else if (s.status !== 'PENDING') closed++;
    } catch {
      // un paiement illisible n'empêche pas les autres
    }
  }
  return { checked: rows.length, paid, closed };
}
