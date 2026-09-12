import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listAnnouncements } from '@/features/communication/announcements';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Annonces' };

const STATUS: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publiée', ARCHIVED: 'Archivée' };

export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'announcements.view');
  const base = `/e/${slug}/annonces`;

  const announcements = await listAnnouncements(ctx);
  const canCreate = hasPermission(ctx, 'announcements.create');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.archived === '1' ? <Alert tone="info">Annonce archivée.</Alert> : null}
      <PageHeader
        title="Annonces"
        description="Communiquer avec les familles et le personnel"
        action={canCreate ? <Link href={`${base}/new`}><Button>Nouvelle annonce</Button></Link> : null}
      />

      {announcements.length === 0 ? (
        <EmptyState title="Aucune annonce" hint="Rédigez une annonce pour informer votre communauté." />
      ) : (
        <ul className="space-y-2">
          {announcements.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`${base}/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {STATUS[a.status] ?? a.status} · {a.audience_label}
                      {a.expires_at ? ` · expire le ${a.expires_at}` : ''}
                    </p>
                  </div>
                  <Link href={`${base}/${a.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">Ouvrir</Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
