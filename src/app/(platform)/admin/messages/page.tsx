import type { Metadata } from 'next';
import Link from 'next/link';
import { listSentMessages, TARGET_LABEL } from '@/features/platform/messages';
import { AUDIENCE_LABEL } from '@/services/platform-messages';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Messages aux écoles — plateforme' };
export const dynamic = 'force-dynamic';

const jour = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');

/** Les messages envoyés aux écoles, et combien de personnes les ont lus (lot 5). */
export default async function PlatformMessagesPage() {
  const messages = await listSentMessages();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Messages aux écoles"
        description="Écrivez une fois à toutes les écoles, ou à quelques-unes, et voyez qui a lu."
        action={
          <Link href="/admin/messages/nouveau">
            <Button>Écrire un message</Button>
          </Link>
        }
      />
      {messages.length === 0 ? (
        <EmptyState title="Aucun message envoyé" hint="Vos messages aux écoles apparaîtront ici, avec le nombre de lectures." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="p-3">Message</th>
                    <th className="p-3">Envoyé à</th>
                    <th className="p-3">Lu</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => {
                    const pct = m.recipients ? Math.round((m.read / m.recipients) * 100) : 0;
                    return (
                      <tr key={m.id} className="border-b align-top">
                        <td className="p-3">
                          <div className="font-medium">{m.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[color:var(--muted-foreground)]">
                            {m.importance === 'IMPORTANT' ? <Pill tone="warn">Important</Pill> : <Pill tone="muted">Information</Pill>}
                            {jour(m.createdAt)}
                            {m.smsSent > 0 ? ` · ${m.smsSent} SMS` : ''}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          {m.target === 'SCHOOLS' ? `${m.schoolsCount} école${m.schoolsCount > 1 ? 's' : ''}` : TARGET_LABEL[m.target]}
                          <div className="text-[color:var(--muted-foreground)]">{m.audience.map((a) => AUDIENCE_LABEL[a]).join(', ')}</div>
                        </td>
                        <td className="min-w-36 p-3 text-xs">
                          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                            <div className="h-full" style={{ width: `${pct}%`, background: 'var(--color-success)' }} />
                          </div>
                          <div className="mt-1 text-[color:var(--muted-foreground)]">
                            {m.read.toLocaleString('fr-FR')} / {m.recipients.toLocaleString('fr-FR')} personnes
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <Link href={`/admin/messages/${m.id}`}>
                            <Button size="sm" variant="secondary">
                              Ouvrir
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
