import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { BillingOverview, SubscribedModule } from '@/features/billing/subscription';

/**
 * Mon abonnement, module par module.
 *
 * Un directeur devant sa facture se demande : depuis quand, jusqu'a quand,
 * combien de jours restants, et est-ce la version complete. Les quatre
 * reponses sont dans le tableau ; le reste est du decor.
 */

const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${c === 'XOF' ? 'F' : c}`;
const jour = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR');

/** Rouge sous une semaine, orange sous un mois : c'est la que la decision se prend. */
function etatJours(m: SubscribedModule): { texte: string; couleur: string | undefined } {
  if (m.endsOn === null) return { texte: 'sans limite', couleur: undefined };
  const j = m.daysLeft ?? 0;
  if (j < 0) return { texte: `dépassé de ${Math.abs(j)} j`, couleur: 'var(--color-danger)' };
  if (j === 0) return { texte: 'dernier jour', couleur: 'var(--color-danger)' };
  if (j <= 7) return { texte: `${j} j`, couleur: 'var(--color-danger)' };
  if (j <= 30) return { texte: `${j} j`, couleur: 'var(--color-warning)' };
  return { texte: `${j} j`, couleur: undefined };
}

export function SubscriptionView({
  data,
  slug,
  canManage,
}: {
  data: BillingOverview;
  slug: string;
  canManage: boolean;
}) {
  const { modules, available, receipts, counts } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Compteur label="Modules" value={counts.total} />
        <Compteur label="Complets" value={counts.full} color="var(--color-success)" />
        <Compteur label="En démonstration" value={counts.demo} color="var(--color-warning)" />
        <Compteur label="Échus" value={counts.expired} color={counts.expired > 0 ? 'var(--color-danger)' : undefined} />
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Modules souscrits</h2>
            {canManage && available.length > 0 ? (
              <Link href={`/e/${slug}/facturation/modules`}>
                <Button size="sm">Ajouter un module</Button>
              </Link>
            ) : null}
          </div>

          {modules.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--surface)' }}>
              Aucun module souscrit pour l’instant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="py-1.5">Module</th>
                    <th className="py-1.5">Souscrit le</th>
                    <th className="py-1.5">Échéance</th>
                    <th className="py-1.5 text-right">Reste</th>
                    <th className="py-1.5 text-center">État</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => {
                    const e = etatJours(m);
                    return (
                      <tr key={m.id} className="border-b align-top">
                        <td className="py-2">
                          <span className="block font-medium">{m.name}</span>
                          <span className="block text-xs text-[color:var(--muted-foreground)]">
                            {money(m.pricePaid ?? m.price, m.currency)} / an
                          </span>
                        </td>
                        <td className="py-2 text-xs tabular-nums">{jour(m.startsOn)}</td>
                        <td className="py-2 text-xs tabular-nums">{m.endsOn ? jour(m.endsOn) : '—'}</td>
                        <td className="py-2 text-right text-xs font-semibold tabular-nums" style={{ color: e.couleur }}>
                          {e.texte}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={
                              m.expired
                                ? { backgroundColor: 'var(--color-danger)', color: '#fff' }
                                : m.mode === 'DEMO'
                                  ? { color: 'var(--color-warning)', border: '1px solid var(--color-warning)' }
                                  : { backgroundColor: 'var(--color-success)', color: '#fff' }
                            }
                          >
                            {m.expired ? 'ÉCHU' : m.mode === 'DEMO' ? 'DÉMO' : 'COMPLET'}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {canManage ? (
                            <Link
                              href={`/e/${slug}/facturation/payer?module=${m.code}`}
                              className="text-xs font-semibold text-[color:var(--color-brand)] hover:underline"
                            >
                              {m.expired || (m.daysLeft !== null && m.daysLeft <= 30) ? 'Renouveler' : 'Payer d’avance'}
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Mes reçus</h2>
            {receipts.length > 0 ? (
              <Link href={`/e/${slug}/facturation/recus`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                Tous mes reçus
              </Link>
            ) : null}
          </div>
          {receipts.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Aucun reçu pour l’instant. Chaque paiement confirmé en produit un, numéroté.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {receipts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs">{r.number}</span>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">
                      {r.label} · {new Date(r.issuedAt).toLocaleDateString('fr-FR')}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Compteur({ label, value, color }: { label: string; value: number; color?: string | undefined }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-2xl font-bold tabular-nums" style={{ color }}>
          {value}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">{label}</p>
      </CardContent>
    </Card>
  );
}
