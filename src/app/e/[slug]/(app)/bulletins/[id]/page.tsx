import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getBulletin, BULLETIN_STATUS } from '@/features/bulletins/queries';
import { BulletinView } from '@/features/bulletins/components/BulletinView';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Bulletin' };

export default async function BulletinDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'reports.view');

  const b = await getBulletin(ctx, id);
  if (!b) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/e/${slug}/bulletins`}><Button variant="ghost">Retour</Button></Link>
        <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
          <span>{BULLETIN_STATUS[b.status] ?? b.status}</span>
          <PrintButton />
        </div>
      </div>
      <BulletinView b={b} />
    </div>
  );
}
