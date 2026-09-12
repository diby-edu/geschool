import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { createClient } from '@/lib/supabase/server';
import { listJustifications } from '@/features/attendance/justifications';
import { submitJustificationAction, decideJustificationAction } from '@/features/attendance/actions';
import { JustificationForm } from '@/features/attendance/components/JustificationForm';
import { DecideForm } from '@/features/attendance/components/DecideForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Justificatifs d’absence' };

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvé', REJECTED: 'Rejeté' };

export default async function JustificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'attendance.justify');
  const base = `/e/${slug}/attendance`;

  const justifications = await listJustifications(ctx);

  const supabase = await createClient();
  const { data: studentRows } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null)
    .order('last_name');
  const students = ((studentRows ?? []) as { id: string; first_name: string; last_name: string }[]).map((s) => ({
    id: s.id,
    name: `${s.last_name.toUpperCase()} ${s.first_name}`,
  }));

  const decided = typeof sp.decided === 'string' ? sp.decided : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash searchParams={sp} />
      {sp.submitted === '1' ? <Alert tone="success">Justificatif enregistré.</Alert> : null}
      {decided.startsWith('ok') ? <Alert tone="success">Justificatif approuvé{decided.slice(3) !== '0' ? ` — ${decided.slice(3)} absence(s) passée(s) en « excusé ».` : '.'}</Alert> : null}
      {decided === 'no' ? <Alert tone="info">Justificatif rejeté.</Alert> : null}

      <PageHeader
        title="Justificatifs d’absence"
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">Déposer un justificatif</h2>
          <JustificationForm action={submitJustificationAction.bind(null, slug)} students={students} />
        </CardContent>
      </Card>

      {justifications.length === 0 ? (
        <EmptyState title="Aucun justificatif" hint="Les justificatifs déposés apparaissent ici." />
      ) : (
        <ul className="space-y-2">
          {justifications.map((j) => (
            <li key={j.id}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{j.student}</span>{' '}
                      <span className="text-xs text-[color:var(--muted-foreground)]">{j.covers_from} → {j.covers_to}</span>
                    </div>
                    <span className="text-xs">{STATUS_LABEL[j.status] ?? j.status}</span>
                  </div>
                  <p className="text-sm text-[color:var(--muted-foreground)]">{j.reason}</p>
                  {j.decision_comment ? <p className="text-xs italic text-[color:var(--muted-foreground)]">Décision : {j.decision_comment}</p> : null}
                  {j.status === 'PENDING' ? <DecideForm action={decideJustificationAction.bind(null, slug, j.id)} /> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
