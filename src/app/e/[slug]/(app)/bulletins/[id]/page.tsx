import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getBulletin, BULLETIN_STATUS } from '@/features/bulletins/queries';
import { BulletinView } from '@/features/bulletins/components/BulletinView';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { AppreciationAssistant } from '@/features/ai/components/AppreciationAssistant';
import { suggestAppreciationAction, saveAppreciationAction } from '@/features/ai/actions';
import { hasPermission } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Bulletin' };

export default async function BulletinDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'reports.view');

  const b = await getBulletin(ctx, id);
  if (!b) notFound();

  const canAppreciate = hasPermission(ctx, 'reports.validate') && b.status !== 'PUBLISHED';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/e/${slug}/bulletins`}><Button variant="ghost">Retour</Button></Link>
        <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
          <span>{BULLETIN_STATUS[b.status] ?? b.status}</span>
          <PrintButton />
        </div>
      </div>

      {sp.appreciation === '1' ? <Alert tone="success">Appréciation enregistrée.</Alert> : null}

      <BulletinView b={b} />

      {canAppreciate ? (
        <Card className="no-print">
          <CardContent>
            <h2 className="mb-2 text-sm font-medium">Appréciation du professeur principal</h2>
            <AppreciationAssistant
              suggestAction={suggestAppreciationAction.bind(null, slug, id)}
              saveAction={saveAppreciationAction.bind(null, slug, id)}
              initial={b.head_teacher_comment ?? ''}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
