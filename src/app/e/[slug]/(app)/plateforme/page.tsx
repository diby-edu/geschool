import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listSchoolRequests, REQUEST_STATUS_LABEL } from '@/features/support/requests';
import { readPlatformContact } from '@/features/platform/settings';
import { createRequestAction } from '@/features/support/actions';
import { TextForm } from '@/features/support/components/TextForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Contacter la plateforme' };

const jour = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');

/** « Contacter la plateforme » (lot 5) : écrire, et retrouver les réponses. */
export default async function ContactPlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'support.contact');
  const [requests, support] = await Promise.all([listSchoolRequests(ctx), readPlatformContact().catch(() => null)]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Contacter la plateforme"
        description={`Une question, un problème, un paiement envoyé : écrivez-nous ici. La réponse arrive dans votre cloche.${
          support?.phone ? ` Urgent : ${support.phone}.` : ''
        }`}
      />
      <Card>
        <CardContent>
          <TextForm action={createRequestAction.bind(null, slug)} withSubject label="Votre message" submit="Envoyer à la plateforme" />
        </CardContent>
      </Card>

      {requests.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/e/${slug}/plateforme/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-[color:var(--muted)]">
                    <span>
                      <b>{r.subject}</b>
                      <span className="block text-xs text-[color:var(--muted-foreground)]">
                        {r.authorName} · {jour(r.createdAt)}
                      </span>
                    </span>
                    <Pill tone={r.status === 'ANSWERED' ? 'good' : r.status === 'OPEN' ? 'warn' : 'muted'}>
                      {r.status === 'OPEN' ? 'En attente de réponse' : REQUEST_STATUS_LABEL[r.status]}
                    </Pill>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
