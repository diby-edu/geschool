import type { Metadata } from 'next';
import Link from 'next/link';
import { listSchoolsForAdmin } from '@/features/platform/admin';
import { sendPlatformMessageAction } from '@/features/platform/messages-actions';
import { MessageForm } from '@/features/platform/components/MessageForm';
import { readSenderForSchool } from '@/features/sms/platform';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Écrire aux écoles — plateforme' };
export const dynamic = 'force-dynamic';

export default async function NewPlatformMessagePage() {
  const [schools, sms] = await Promise.all([listSchoolsForAdmin(), readSenderForSchool()]);
  const open = schools.filter((s) => s.status !== 'ARCHIVED');
  const st = (s: (typeof open)[number]) => s.subscription?.status ?? null;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Écrire aux écoles"
        description="Le message arrive dans la cloche des personnes choisies. Vous voyez le nombre de personnes avant d’envoyer."
        action={
          <Link href="/admin/messages">
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />
      <Card>
        <CardContent>
          <MessageForm
            action={sendPlatformMessageAction}
            schools={open.map((s) => ({ id: s.id, name: s.name }))}
            counts={{
              ALL: open.length,
              TRIALING: open.filter((s) => st(s) === 'TRIALING').length,
              PAID: open.filter((s) => st(s) === 'ACTIVE').length,
              EXPIRED: open.filter((s) => st(s) === 'PAST_DUE').length,
            }}
            pricePerSms={sms.pricePerSms}
          />
        </CardContent>
      </Card>
    </div>
  );
}
