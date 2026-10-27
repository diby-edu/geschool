import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getRequestThread } from '@/features/support/requests';
import { replyRequestAction } from '@/features/support/actions';
import { TextForm } from '@/features/support/components/TextForm';
import { Thread } from '@/features/support/components/Thread';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Demande à la plateforme' };

export default async function SchoolRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'support.contact');
  const thread = await getRequestThread(id, ctx.school.id);
  if (!thread) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={thread.subject}
        description={thread.status === 'OPEN' ? 'En attente de réponse de la plateforme.' : thread.status === 'ANSWERED' ? 'La plateforme a répondu.' : 'Demande terminée.'}
        action={
          <Link href={`/e/${slug}/plateforme`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />
      {sp.envoye ? <Alert tone="success">Message envoyé à la plateforme.</Alert> : null}
      <Thread messages={thread.messages} mineLabel="Votre école" />
      {thread.status !== 'CLOSED' ? (
        <Card>
          <CardContent>
            <TextForm action={replyRequestAction.bind(null, slug, id)} label="Ajouter un message" submit="Envoyer" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
