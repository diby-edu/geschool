import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listAccessHistory } from '@/features/access/history';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Historique des accès' };
export const dynamic = 'force-dynamic';

/** Les événements qui comptent comme un incident, à faire ressortir. */
const ALERTES = new Set(['ACCOUNT_SUSPENDED', 'LOGIN_FAILED', 'LOGIN_LOCKED']);

export default async function AccessHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'access_accounts.view_history');

  const events = await listAccessHistory(ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Historique des accès"
        description="Qui a reçu ses identifiants, quand, et ce qui est arrivé à son compte depuis."
        action={
          <Link href={`/e/${slug}/access`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          title="Aucun événement"
          hint="Les créations de compte, envois d’identifiants et suspensions apparaîtront ici."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm">
                  <span className="w-36 shrink-0 text-xs text-[color:var(--muted-foreground)]">
                    {new Date(e.at).toLocaleString('fr-FR')}
                  </span>
                  <span
                    className="font-medium"
                    style={ALERTES.has(e.type) ? { color: 'var(--color-danger)' } : undefined}
                  >
                    {e.label}
                  </span>
                  <span>{e.person}</span>
                  {e.detail ? <span className="text-[color:var(--muted-foreground)]">{e.detail}</span> : null}
                  {e.actor ? (
                    <span className="text-xs text-[color:var(--muted-foreground)]">par {e.actor}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Cet historique ne s’efface pas. Il répond à la question « je n’ai jamais reçu mes codes » autrement que de
        mémoire.
      </p>
    </div>
  );
}
