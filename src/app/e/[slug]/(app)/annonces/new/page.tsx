import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { createAnnouncementAction } from '@/features/communication/actions';
import { AnnouncementForm } from '@/features/communication/components/AnnouncementForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Nouvelle annonce' };

export default async function NewAnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'announcements.create');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Nouvelle annonce" action={<Link href={`/e/${slug}/annonces`}><Button variant="ghost">Retour</Button></Link>} />
      <AnnouncementForm action={createAnnouncementAction.bind(null, slug)} />
    </div>
  );
}
