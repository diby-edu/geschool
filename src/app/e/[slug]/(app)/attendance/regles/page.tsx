import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { readAttendancePolicy } from '@/features/attendance/policy';
import { saveAttendancePolicyAction } from '@/features/attendance/policy-actions';
import { PolicyForm } from '@/features/attendance/components/PolicyForm';
import { GapReasonsForm } from '@/features/attendance/components/GapReasonsForm';
import { readGapReasons } from '@/features/attendance/gaps';
import { saveGapReasonsAction } from '@/features/attendance/gap-actions';
import { readSenderForSchool } from '@/features/sms/platform';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Règles de présence' };

export default async function AttendancePolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'settings.update');
  requireFeature(ctx, 'attendance');

  const [policy, sms, gapReasons] = await Promise.all([
    readAttendancePolicy(ctx),
    readSenderForSchool(),
    readGapReasons(ctx),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {sp.enregistre ? <Alert tone="success">Règles enregistrées.</Alert> : null}

      <PageHeader
        title="Règles de présence"
        description="Quand prévenir, et qui."
        action={
          <Link href={`/e/${slug}/attendance`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent>
          <PolicyForm
            action={saveAttendancePolicyAction.bind(null, slug)}
            policy={policy}
            pricePerSms={sms.pricePerSms}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <GapReasonsForm action={saveGapReasonsAction.bind(null, slug)} reasons={gapReasons} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-semibold">Ce qui n’est pas réglable, et pourquoi</p>
          <ul className="space-y-1.5 text-sm text-[color:var(--muted-foreground)]">
            <li>
              <strong className="text-[color:var(--foreground)]">L’appel se fait pendant le cours, par l’enseignant.</strong>{' '}
              Aucune marge avant ni après&nbsp;: l’appel atteste aussi que l’enseignant était là, et deux cours qui se
              suivent ne doivent jamais se contredire sur le même élève.
            </li>
            <li>
              <strong className="text-[color:var(--foreground)]">Une absence se justifie jusqu’à la clôture de la période.</strong>{' '}
              Pas de délai en jours à surveiller.
            </li>
            <li>
              <strong className="text-[color:var(--foreground)]">Qui peut justifier relève des droits</strong>, pas d’un
              réglage : cochez « Traiter les justificatifs d’absence » pour les fonctions concernées.
            </li>
            <li>
              <strong className="text-[color:var(--foreground)]">Un cours sans appel n’accuse personne.</strong> Oubli,
              absence de l’enseignant ou cours non tenu&nbsp;: les élèves restent « non renseignés » et n’entrent pas
              dans le calcul des absences. L’écran{' '}
              <Link href={`/e/${slug}/attendance/non-faits`} className="underline">
                Appels non faits
              </Link>{' '}
              les liste pour qu’on dise ce qui s’est passé&nbsp;; le droit de le faire se coche par fonction.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
