'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { myChildren, parentPortal } from './children';

/**
 * Le parent paie l'Espace Parent pour les enfants cochés (0172, maquette
 * espace-parent.html, écran A). Un enfant par ligne au prix de l'école ; le
 * prix ne dépend jamais du nombre de tuteurs. Seuls SES enfants encore fermés
 * sont retenus : un identifiant d'un autre élève est ignoré.
 */
export async function payParentAccessAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const wanted = new Set(fd.getAll('enfant').map(String));
    const [children, portal] = await Promise.all([myChildren(ctx), parentPortal(ctx)]);
    const chosen = children.filter((c) => wanted.has(c.id) && !c.unlocked);
    if (chosen.length === 0) throw new ValidationError('Cochez au moins un enfant à activer.');
    if (!(portal.price > 0)) throw new ValidationError('L’Espace Parent est offert par l’établissement : rien à payer.');

    const amount = portal.price * chosen.length;
    const { startOnlinePayment } = await import('@/services/online-payments');
    const { url } = await startOnlinePayment({
      schoolId: ctx.school.id,
      slug,
      userId: ctx.user.id,
      purpose: 'PARENT_ACCESS',
      amount,
      description: `${ctx.school.name} — Espace Parent : ${chosen.map((c) => c.name).join(', ')}`,
      items: chosen.map((c) => ({ name: `Espace Parent — ${c.name}`, quantity: 1, unitPrice: portal.price })),
      studentIds: chosen.map((c) => c.id),
    });
    redirect(url);
  });
}
