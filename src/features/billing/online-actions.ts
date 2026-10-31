'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { requirePermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { alreadyPaid, readBilling } from './subscription';

/**
 * Payer en ligne (PayDunya, 0157) depuis l'école : un module, tout l'abonnement
 * (page « Abonnement expiré »), ou un pack de SMS. Le montant est calculé ici,
 * jamais reçu du formulaire. Pas d'exigence « école inscriptible » : une école
 * coupée doit justement pouvoir payer.
 */

/**
 * `target` : le code d'un module, plusieurs codes séparés par des virgules, ou
 * 'ALL' pour tous les modules souscrits. Sans `target` (page Abonnement), les
 * modules cochés arrivent dans le formulaire (champ `module`).
 */
export async function payModulesOnlineAction(slug: string, target: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, 'billing.manage');
    const billing = await readBilling(ctx);
    const codes = new Set(target ? target.split(',') : fd.getAll('module').map(String));
    const paid = billing.modules.filter((m) => alreadyPaid(m) && (target === 'ALL' || codes.has(m.code)));
    if (paid.length > 0 && target !== 'ALL')
      throw new ValidationError(`${paid.map((m) => m.name).join(', ')} : déjà payé jusqu’au ${new Date(`${paid[0]!.endsOn}T00:00:00`).toLocaleDateString('fr-FR')}.`);
    const unpaid = billing.modules.filter((m) => !alreadyPaid(m));
    const lines =
      target === 'ALL'
        ? unpaid.map((m) => ({ moduleId: m.moduleId, name: m.name, price: m.pricePaid ?? m.price }))
        : [
            ...unpaid.filter((m) => codes.has(m.code)).map((m) => ({ moduleId: m.moduleId, name: m.name, price: m.pricePaid ?? m.price })),
            ...billing.available.filter((m) => codes.has(m.code)).map((m) => ({ moduleId: m.id, name: m.name, price: m.price })),
          ];
    // Réduction gagnée par les élèves activés dans l'Espace Parent (0172), le
    // jour du paiement ; appliquée ligne par ligne pour que la facture tombe juste.
    const { readParentStats, discounted } = await import('./parent-portal');
    const discountPct = (await readParentStats(ctx))?.discountPct ?? 0;
    const priced = lines.map((l) => ({ ...l, price: discounted(l.price, discountPct) }));
    const amount = priced.reduce((n, l) => n + l.price, 0);
    if (lines.length === 0 || amount <= 0) throw new ValidationError('Rien à payer pour ce choix.');
    const { startOnlinePayment } = await import('@/services/online-payments');
    const { paymentId, url } = await startOnlinePayment({
      schoolId: ctx.school.id,
      slug,
      userId: ctx.user.id,
      purpose: 'SUBSCRIPTION',
      amount,
      description: `${ctx.school.name} — abonnement : ${lines.map((l) => l.name).join(', ')}`,
      items: priced.map((l) => ({
        name: l.name,
        quantity: 1,
        unitPrice: l.price,
        description: discountPct > 0 ? `Abonnement, année scolaire — réduction Espace Parent ${discountPct} %` : 'Abonnement, année scolaire',
      })),
      moduleIds: lines.map((l) => l.moduleId),
      ...(discountPct > 0 ? { discountPct } : {}),
    });
    await audit(ctx, { action: 'billing.online_start', module: 'billing', entityType: 'payment', entityId: paymentId, after: { amount, discountPct, modules: lines.map((l) => l.name) } });
    redirect(url);
  });
}

/** Acheter un pack de SMS : le nombre vient de la liste de la plateforme, pas du formulaire. */
export async function buySmsPackAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requirePermission(ctx, 'billing.manage');
    const { readOnlineOffer, startOnlinePayment } = await import('@/services/online-payments');
    const offer = await readOnlineOffer();
    const pack = offer.smsPacks.find((p) => p.quantity === Number(fd.get('quantity')));
    if (!pack) throw new ValidationError('Choisissez un pack de SMS.');
    const { paymentId, url } = await startOnlinePayment({
      schoolId: ctx.school.id,
      slug,
      userId: ctx.user.id,
      purpose: 'SMS_PACK',
      amount: pack.price,
      description: `${ctx.school.name} — pack de ${pack.quantity} SMS`,
      items: [{ name: `Pack de ${pack.quantity} SMS`, quantity: 1, unitPrice: pack.price, description: 'Ajoutés au mois en cours' }],
      smsQuantity: pack.quantity,
    });
    await audit(ctx, { action: 'billing.online_start', module: 'billing', entityType: 'payment', entityId: paymentId, after: { amount: pack.price, sms: pack.quantity } });
    redirect(url);
  });
}
