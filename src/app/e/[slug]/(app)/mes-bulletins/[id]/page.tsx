import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getBulletin } from '@/features/bulletins/queries';
import { BulletinView } from '@/features/bulletins/components/BulletinView';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Bulletin' };

export default async function MonBulletinPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);

  // RLS : ne renvoie le bulletin que s'il est PUBLIÉ et visible par l'utilisateur.
  const b = await getBulletin(ctx, id);
  if (!b || b.status !== 'PUBLISHED') notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/e/${slug}/mes-bulletins`}><Button variant="ghost">Retour</Button></Link>
        <PrintButton />
      </div>
      <BulletinView b={b} />
    </div>
  );
}
