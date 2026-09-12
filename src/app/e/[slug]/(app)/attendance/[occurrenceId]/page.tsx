import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { loadAppel } from '@/features/attendance/registers';
import { submitRegisterAction, validateRegisterAction } from '@/features/attendance/actions';
import { AppelGrid } from '@/features/attendance/components/AppelGrid';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Appel' };

const REG_LABEL: Record<string, string> = { OPEN: 'En cours', SUBMITTED: 'Soumis', VALIDATED: 'Validé' };

export default async function AppelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; occurrenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, occurrenceId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'attendance.view');
  const base = `/e/${slug}/attendance`;

  let appel;
  try {
    appel = await loadAppel(ctx, occurrenceId);
  } catch {
    notFound();
  }

  const canValidate = hasPermission(ctx, 'attendance.validate');
  const canTake = hasPermission(ctx, 'attendance.create') || hasPermission(ctx, 'attendance.update');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash searchParams={sp} />
      {sp.submitted === '1' ? <Alert tone="success">Appel soumis.</Alert> : null}
      {sp.validated === '1' ? <Alert tone="success">Appel validé.</Alert> : null}

      <PageHeader
        title={`Appel — ${appel.klass}`}
        description={`${appel.subject} · ${appel.when}`}
        action={<Link href={`${base}?date=${appel.when.slice(0, 10)}`}><Button variant="ghost">Retour</Button></Link>}
      />

      {appel.registerStatus ? (
        <Card>
          <CardContent className="flex items-center justify-between py-3 text-sm">
            <span>État de l’appel : <strong>{REG_LABEL[appel.registerStatus] ?? appel.registerStatus}</strong></span>
            <div className="flex items-center gap-2">
              {canTake && appel.registerId && appel.registerStatus === 'OPEN' ? (
                <SimpleSubmit action={submitRegisterAction.bind(null, slug, occurrenceId, appel.registerId)} label="Soumettre" small />
              ) : null}
              {canValidate && appel.registerId && appel.registerStatus !== 'VALIDATED' ? (
                <SimpleSubmit action={validateRegisterAction.bind(null, slug, occurrenceId, appel.registerId)} label="Valider" small />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canTake ? (
        <AppelGrid slug={slug} occurrenceId={occurrenceId} editable={appel.editable} students={appel.students} />
      ) : (
        <Alert tone="info">Vous n’avez pas le droit de faire l’appel.</Alert>
      )}
    </div>
  );
}
