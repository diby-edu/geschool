import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/features/platform/admin';
import { readPlatformSettings } from '@/features/platform/settings';
import { savePlatformSettingsAction } from '@/features/platform/settings-actions';
import { readPaymentSettingsForAdmin } from '@/features/billing/payment-settings';
import { KeepForm } from '@/features/platform/components/KeepForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { BlocHead, Card } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Réglages — plateforme' };
export const dynamic = 'force-dynamic';

/**
 * Réglages de la plateforme (lot 6, maquette docs/maquettes/super-admin-reglages.html).
 * Les paiements et les SMS gardent leur page.
 */
export default async function PlatformSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [s, pay] = await Promise.all([readPlatformSettings(), readPaymentSettingsForAdmin()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Réglages de la plateforme" description="Ce qui vaut pour toutes les écoles." />
      {sp.enregistre ? <Alert tone="success">Réglages enregistrés.</Alert> : null}
      <KeepForm action={savePlatformSettingsAction} submit="Enregistrer" className="grid gap-5 md:grid-cols-2">
        <Card>
          <BlocHead title="La plateforme" sub="Affiché aux écoles : « Contacter la plateforme », « Abonnement expiré »." />
          <div className="mt-4 space-y-3">
            <Field label="Nom affiché" htmlFor="name">
              <Input id="name" name="name" maxLength={60} defaultValue={s.name} />
            </Field>
            <Field label="Téléphone / WhatsApp du support" htmlFor="supportPhone">
              <Input id="supportPhone" name="supportPhone" type="tel" maxLength={30} defaultValue={s.supportPhone} placeholder="07 07 00 00 00" />
            </Field>
            <Field label="E-mail du support" htmlFor="supportEmail">
              <Input id="supportEmail" name="supportEmail" type="email" maxLength={120} defaultValue={s.supportEmail} placeholder="support@exemple.ci" />
            </Field>
          </div>
        </Card>
        <Card>
          <BlocHead title="Inscription et abonnement" />
          <div className="mt-4 space-y-3">
            <Field label="Durée de l’essai gratuit (jours)" htmlFor="trialDays" hint="Pour les écoles qui s’inscrivent à partir de maintenant.">
              <Input id="trialDays" name="trialDays" type="number" min={0} max={365} defaultValue={s.trialDays} />
            </Field>
            <Field label="Délai de grâce après expiration (jours)" htmlFor="graceDays" hint="Ensuite, l’accès est coupé jusqu’au paiement.">
              <Input id="graceDays" name="graceDays" type="number" min={0} max={90} defaultValue={pay.graceDays} />
            </Field>
            <Field label="École « à risque » après (jours de cours sans activité)" htmlFor="riskDays">
              <Input id="riskDays" name="riskDays" type="number" min={1} max={30} defaultValue={s.riskDays} />
            </Field>
            <Field label="Taille permise de la base (Mo)" htmlFor="dbLimitMb" hint="Offre Supabase gratuite : 500 Mo ; offre Pro : 8 000 Mo. Sert aux voyants de la page Technique.">
              <Input id="dbLimitMb" name="dbLimitMb" type="number" min={100} defaultValue={s.dbLimitMb} />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/admin/paiements">
                <Button type="button" variant="secondary" size="sm">
                  Mobile Money et instructions de paiement
                </Button>
              </Link>
              <Link href="/admin/sms">
                <Button type="button" variant="secondary" size="sm">
                  Expéditeur et prix des SMS
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </KeepForm>
    </div>
  );
}
