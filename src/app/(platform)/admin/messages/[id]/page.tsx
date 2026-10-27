import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSentMessage, TARGET_LABEL } from '@/features/platform/messages';
import { AUDIENCE_LABEL } from '@/services/platform-messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Message aux écoles — plateforme' };
export const dynamic = 'force-dynamic';

const jour = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

/** Un message envoyé : son texte, et école par école combien l'ont lu (les moins lues d'abord). */
export default async function PlatformMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getSentMessage(id);
  if (!data) notFound();
  const { message: m, schools } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {sp.envoye ? (
        <Alert tone="success">
          Message envoyé à {m.recipients.toLocaleString('fr-FR')} personne{m.recipients > 1 ? 's' : ''}
          {m.smsToFounder ? `, et ${m.smsSent} SMS aux fondateurs` : ''}.
        </Alert>
      ) : null}
      <Card>
        <BlocHead
          title={m.title}
          sub={`Envoyé le ${jour(m.createdAt)} · ${m.target === 'SCHOOLS' ? `${m.schoolsCount} école(s)` : TARGET_LABEL[m.target]} · ${m.audience.map((a) => AUDIENCE_LABEL[a]).join(', ')}`}
          right={
            <Link href="/admin/messages">
              <Button variant="ghost" size="sm">
                Retour
              </Button>
            </Link>
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {m.importance === 'IMPORTANT' ? <Pill tone="warn">Important</Pill> : <Pill tone="muted">Information</Pill>}
          {m.showUntil ? <Pill tone="muted">Bandeau jusqu’au {jour(m.showUntil)}</Pill> : null}
          {m.smsToFounder ? <Pill tone="info">{m.smsSent} SMS aux fondateurs</Pill> : null}
        </div>
        {m.body ? <p className="mt-4 whitespace-pre-line text-sm">{m.body}</p> : null}
      </Card>

      <Card>
        <BlocHead
          title={`Lu par ${m.read.toLocaleString('fr-FR')} personne${m.read > 1 ? 's' : ''} sur ${m.recipients.toLocaleString('fr-FR')}`}
          sub="École par école, les moins lues d’abord"
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-2">École</th>
                <th className="px-2 py-2">Lu</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-2">
                    <Link href={`/admin/etablissements/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    {s.read} / {s.recipients}
                    {s.read === 0 ? (
                      <span className="ml-2">
                        <Pill tone="bad">Personne ne l’a lu</Pill>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
