import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getAnnouncement } from '@/features/communication/announcements';
import { AnnouncementForm } from '@/features/communication/components/AnnouncementForm';
import {
  updateAnnouncementAction,
  publishAnnouncementAction,
  archiveAnnouncementAction,
} from '@/features/communication/actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Annonce' };

const STATUS: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publiée', ARCHIVED: 'Archivée' };

export default async function AnnouncementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'announcements.view');
  const base = `/e/${slug}/annonces`;

  const a = await getAnnouncement(ctx, id);
  if (!a) notFound();

  const canPublish = hasPermission(ctx, 'announcements.publish');
  const editable = canPublish && a.status !== 'ARCHIVED';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {sp.notified !== undefined ? <Alert tone="success">Annonce publiée — {sp.notified} destinataire(s) notifié(s).</Alert> : null}
      {sp.updated === '1' ? <Alert tone="success">Annonce mise à jour.</Alert> : null}

      <PageHeader title={a.title} description={STATUS[a.status] ?? a.status} action={<Link href={base}><Button variant="ghost">Retour</Button></Link>} />

      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="whitespace-pre-wrap text-sm">{a.body}</p>
          <div className="flex items-center gap-2 border-t pt-3">
            {canPublish && a.status === 'DRAFT' ? (
              <SimpleSubmit action={publishAnnouncementAction.bind(null, slug, id)} label="Publier et notifier" small />
            ) : null}
            {canPublish && a.status !== 'ARCHIVED' ? (
              <SimpleSubmit action={archiveAnnouncementAction.bind(null, slug, id)} label="Archiver" small />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {editable && a.status === 'DRAFT' ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Modifier le brouillon</h2>
          <AnnouncementForm
            action={updateAnnouncementAction.bind(null, slug, id)}
            submitLabel="Enregistrer"
            defaults={{ title: a.title, body: a.body, all: a.audience?.all ?? false, roles: a.audience?.roles ?? [], expiresAt: a.expires_at }}
          />
        </section>
      ) : null}
    </div>
  );
}
