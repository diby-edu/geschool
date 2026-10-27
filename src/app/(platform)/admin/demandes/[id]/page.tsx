import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRequestThread } from '@/features/support/requests';
import { closePlatformRequestAction, replyPlatformRequestAction } from '@/features/platform/requests-actions';
import { TextForm } from '@/features/support/components/TextForm';
import { Thread } from '@/features/support/components/Thread';
import { requireAdmin } from '@/features/platform/admin';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Demande d’une école — plateforme' };
export const dynamic = 'force-dynamic';

export default async function PlatformRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const thread = await getRequestThread(id);
  if (!thread) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={thread.subject}
        description={`${thread.schoolName} · ${thread.authorName}`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/etablissements/${thread.schoolId}`}>
              <Button variant="secondary">Fiche de l’école</Button>
            </Link>
            <Link href="/admin/demandes">
              <Button variant="ghost">Retour</Button>
            </Link>
          </div>
        }
      />
      {sp.repondu ? <Alert tone="success">Réponse envoyée : elle arrive dans la cloche de {thread.authorName}.</Alert> : null}
      <Thread messages={thread.messages} mineLabel={thread.schoolName} />
      {thread.status !== 'CLOSED' ? (
        <Card>
          <CardContent className="space-y-4">
            <TextForm action={replyPlatformRequestAction.bind(null, id)} label="Votre réponse" submit="Répondre" />
            <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <SimpleSubmit action={closePlatformRequestAction.bind(null, id)} label="Marquer comme terminée" small />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert tone="info">Demande terminée. L’école peut en ouvrir une nouvelle si besoin.</Alert>
      )}
    </div>
  );
}
