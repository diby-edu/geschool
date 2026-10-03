import type { Metadata } from 'next';
import Link from 'next/link';
import { readPlatformSms } from '@/features/sms/platform';
import { PlatformSmsForm } from '@/features/sms/components/PlatformSmsForm';
import { smsBalance } from '@/features/sms/balance';
import { readSmsJournal } from '@/features/sms/journal';
import { savePlatformSmsAction, refreshStatusesAction } from '@/features/sms/actions';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'SMS — plateforme' };
export const dynamic = 'force-dynamic';

const ETAT: Record<string, string> = {
  QUEUED: 'En attente',
  SENT: 'Parti',
  DELIVERED: 'Arrivé',
  FAILED: 'Échec',
};
const ETAT_COULEUR: Record<string, string> = {
  DELIVERED: 'var(--color-success)',
  FAILED: 'var(--color-danger)',
  SENT: 'var(--foreground)',
  QUEUED: 'var(--muted-foreground)',
};

export default async function PlatformSmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [reglages, solde, journal] = await Promise.all([readPlatformSms(), smsBalance(), readSmsJournal(60)]);

  const restants = solde !== null && reglages.pricePerSms > 0 ? Math.floor(solde / reglages.pricePerSms) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {sp.enregistre ? <Alert tone="success">Réglages enregistrés.</Alert> : null}

      <PageHeader
        title="SMS"
        description="Le compte opérateur de la plateforme, le prix facturé et le nom d’expéditeur prêté aux établissements."
        action={
          <Link href="/admin">
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-semibold">Crédit chez l’opérateur</p>
          {solde === null ? (
            <Alert tone="info">
              Solde indisponible : l’opérateur n’a pas répondu, ou aucune clé n’est configurée sur ce serveur.
            </Alert>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums">{solde.toLocaleString('fr-FR')}</p>
              {restants !== null ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  soit environ <strong>{restants.toLocaleString('fr-FR')} SMS</strong> au prix de{' '}
                  {reglages.pricePerSms} par message.
                </p>
              ) : null}
              {restants !== null && restants < 200 ? (
                <Alert tone="error">
                  Moins de 200 SMS restants. Rechargez avant la prochaine vague d’identifiants.
                </Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <PlatformSmsForm action={savePlatformSmsAction} settings={reglages} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Derniers envois</p>
            <span className="flex flex-wrap items-center gap-2">
              <a href="/admin/export/sms" download>
                <Button variant="secondary" size="sm">
                  Exporter
                </Button>
              </a>
              <SimpleSubmit action={refreshStatusesAction} label="Demander les accusés de réception" small />
            </span>
          </div>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {journal.totals.sent} parti(s) · {journal.totals.delivered} arrivé(s) · {journal.totals.failed} échec(s) ·{' '}
            {journal.totals.parts} SMS facturés pour {Math.round(journal.totals.cost).toLocaleString('fr-FR')}
          </p>

          {journal.rows.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--surface)' }}>
              Aucun SMS envoyé pour l’instant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="py-1.5">Quand</th>
                    <th className="py-1.5">Établissement</th>
                    <th className="py-1.5">Numéro</th>
                    <th className="py-1.5">Expéditeur</th>
                    <th className="py-1.5 text-center">SMS</th>
                    <th className="py-1.5">État</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.rows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="py-1.5 text-xs">{new Date(r.at).toLocaleString('fr-FR')}</td>
                      <td className="py-1.5 text-xs">{r.school ?? 'Plateforme'}</td>
                      <td className="py-1.5 text-xs tabular-nums">{r.to}</td>
                      <td className="py-1.5 text-xs">{r.sender}</td>
                      <td className="py-1.5 text-center text-xs tabular-nums">
                        {r.parts}
                        {r.parts > 1 ? <span className="text-[color:var(--color-warning)]"> ⚠</span> : null}
                      </td>
                      <td className="py-1.5 text-xs">
                        <span style={{ color: ETAT_COULEUR[r.status] }}>{ETAT[r.status] ?? r.status}</span>
                        {r.error ? (
                          <span className="block text-[color:var(--muted-foreground)]">{r.error.slice(0, 80)}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Un message compté 2 SMS contient un caractère hors alphabet GSM : il est facturé double.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
