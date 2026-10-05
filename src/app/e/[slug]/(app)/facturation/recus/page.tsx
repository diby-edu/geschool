import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { readBilling } from '@/features/billing/subscription';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Mes reçus' };
export const dynamic = 'force-dynamic';

const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${c === 'XOF' ? 'F' : c}`;

/** Tous les recus, du plus recent au plus ancien. Un recu ne se modifie pas. */
export default async function ReceiptsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'billing.view');

  const { receipts } = await readBilling(ctx, 200);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Mes reçus"
        description="Chaque paiement confirmé produit un reçu numéroté, qui ne change plus."
        action={
          <Link href={`/e/${slug}/facturation`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {receipts.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Aucun reçu pour l’instant.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  <th className="py-1.5">Numéro</th>
                  <th className="py-1.5">Objet</th>
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 font-mono text-xs">{r.number}</td>
                    <td className="py-2">{r.label}</td>
                    <td className="py-2 text-xs tabular-nums">{new Date(r.issuedAt).toLocaleDateString('fr-FR')}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(r.amount, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
