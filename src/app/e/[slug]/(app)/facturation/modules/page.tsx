import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { readBilling } from '@/features/billing/subscription';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Ajouter un module' };
export const dynamic = 'force-dynamic';

const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${c === 'XOF' ? 'F' : c}`;

/**
 * Le catalogue de ce qui n'est pas encore souscrit.
 *
 * On ne « coche » pas un module ici : on le paie. Souscrire sans payer
 * laisserait un module ouvert que personne n'a regle — l'ecran mene donc au
 * paiement, et c'est le paiement confirme qui ouvre l'acces.
 */
export default async function AddModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'billing.manage');

  const { available } = await readBilling(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Ajouter un module"
        description="Ce que vous n’avez pas encore. Le module s’ouvre dès que le paiement est confirmé."
        action={
          <Link href={`/e/${slug}/facturation`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {available.length === 0 ? (
        <Alert tone="success">Vous avez déjà tous les modules du catalogue.</Alert>
      ) : (
        <ul className="space-y-3">
          {available.map((m) => (
            <li key={m.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{m.name}</p>
                    <p className="mt-0.5 text-sm text-[color:var(--muted-foreground)]">{m.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{money(m.price, m.currency)}</p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">par an</p>
                    <Link href={`/e/${slug}/facturation/payer?module=${m.code}`}>
                      <Button size="sm" className="mt-2">
                        Souscrire
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
