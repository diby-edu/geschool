import type { Metadata } from 'next';
import Link from 'next/link';
import { listAllRequests, REQUEST_STATUS_LABEL, type RequestStatus } from '@/features/support/requests';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilterPill } from '@/components/ui/filters';
import { Pill } from '@/features/dashboard/components/ui';
import { requireAdmin } from '@/features/platform/admin';

export const metadata: Metadata = { title: 'Demandes des écoles — plateforme' };
export const dynamic = 'force-dynamic';

const STATUSES: RequestStatus[] = ['OPEN', 'ANSWERED', 'CLOSED'];
const quand = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Les demandes écrites par les écoles (« Contacter la plateforme », lot 5). */
export default async function PlatformRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filtre = STATUSES.find((s) => s === sp.etat);
  const all = await listAllRequests();
  const rows = filtre ? all.filter((r) => r.status === filtre) : all;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Demandes des écoles" description="Ce que les écoles vous écrivent depuis « Contacter la plateforme ». Votre réponse arrive dans leur cloche." />
      {sp.termine ? <Alert tone="success">Demande terminée.</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <FilterPill href="/admin/demandes" label="Toutes" value={all.length} active={!filtre} />
        {STATUSES.map((s) => (
          <FilterPill key={s} href={`/admin/demandes?etat=${s}`} label={REQUEST_STATUS_LABEL[s]} value={all.filter((r) => r.status === s).length} active={filtre === s} />
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Aucune demande" hint="Les demandes des écoles apparaîtront ici." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="p-3">Demande</th>
                    <th className="p-3">École</th>
                    <th className="p-3">État</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="p-3">
                        <div className="font-medium">{r.subject}</div>
                        <div className="text-xs text-[color:var(--muted-foreground)]">
                          {r.authorName} · {quand(r.updatedAt)}
                        </div>
                      </td>
                      <td className="p-3">{r.schoolName}</td>
                      <td className="p-3">
                        <Pill tone={r.status === 'OPEN' ? 'warn' : r.status === 'ANSWERED' ? 'good' : 'muted'}>{REQUEST_STATUS_LABEL[r.status]}</Pill>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/admin/demandes/${r.id}`}>
                          <Button size="sm" variant={r.status === 'OPEN' ? 'primary' : 'secondary'}>
                            {r.status === 'OPEN' ? 'Répondre' : 'Ouvrir'}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
