import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { readSender } from '@/features/sms/sender';
import { readSmsQuota, quotaLabel, WARN_RATIO } from '@/features/sms/quota';
import { buildDossier, dossierEmail, exemples } from '@/features/sms/dossier';
import { saveSenderAction, markSenderRequestedAction, setSenderStatusAction } from '@/features/sms/actions';
import { SenderForm } from '@/features/sms/components/SenderForm';
import { SenderStatusForm } from '@/features/sms/components/SenderStatusForm';
import { SENDER_STATUS_LABELS, waitingDays } from '@/features/sms/sender-types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Expéditeur des SMS' };

export default async function SmsSenderPage({
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

  const sender = await readSender(ctx);
  const quota = await readSmsQuota(ctx);
  const { row, missing } = await buildDossier(ctx);
  const jours = waitingDays(sender.requestedOn);
  const mail = dossierEmail(ctx.school.name, sender.name || sender.platformSender);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Flash searchParams={sp} />
      {sp.enregistre ? <Alert tone="success">Réglages enregistrés.</Alert> : null}
      {sp.envoye ? <Alert tone="success">Dossier marqué comme envoyé. Comptez jusqu’à dix jours de validation.</Alert> : null}
      {sp.etat === 'approved' ? <Alert tone="success">Nom d’expéditeur approuvé : vos SMS partent désormais sous votre nom.</Alert> : null}
      {sp.etat === 'rejected' ? <Alert tone="error">Refus enregistré. Corrigez le dossier et renvoyez-le.</Alert> : null}

      <PageHeader
        title="Expéditeur des SMS"
        description="Le nom que les familles verront s’afficher sur leur téléphone."
        action={
          <Link href={`/e/${slug}/parametres`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">État de votre nom d’expéditeur</p>
            <span className="text-sm">{SENDER_STATUS_LABELS[sender.status].title}</span>
          </div>
          <p className="text-sm text-[color:var(--muted-foreground)]">{SENDER_STATUS_LABELS[sender.status].hint}</p>
          {sender.status === 'REQUESTED' && jours !== null ? (
            <Alert tone={jours > 10 ? 'error' : 'info'}>
              Dossier envoyé il y a {jours} jour{jours > 1 ? 's' : ''}.
              {jours > 10 ? ' Le délai annoncé est dépassé : relancez l’opérateur.' : ''}
            </Alert>
          ) : null}
          {sender.rejectionReason ? <Alert tone="error">Motif du refus : {sender.rejectionReason}</Alert> : null}
          <p className="rounded-xl border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
            Aujourd’hui, vos SMS partent sous&nbsp;: <strong>{sender.effective}</strong>
            {sender.effective === sender.platformSender ? (
              <span className="text-[color:var(--muted-foreground)]"> — le nom prêté par la plateforme.</span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {quota && !quota.unlimited ? (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">Vos SMS ce mois-ci</p>
              <span className="text-sm tabular-nums">
                {quota.used.toLocaleString('fr-FR')} / {quota.limit.toLocaleString('fr-FR')}
              </span>
            </div>

            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--surface)' }}
              role="presentation"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(quota.ratio * 100)}%`,
                  backgroundColor:
                    quota.ratio >= 1
                      ? 'var(--color-danger)'
                      : quota.ratio >= WARN_RATIO
                        ? 'var(--color-warning)'
                        : 'var(--color-success)',
                }}
              />
            </div>

            <p className="text-sm text-[color:var(--muted-foreground)]">{quotaLabel(quota)}</p>

            {quota.remaining === 0 ? (
              <Alert tone="error">
                Quota épuisé. Les alertes d’absence par SMS ne partent plus jusqu’au mois prochain.{' '}
                <strong>Les identifiants de connexion continuent de partir</strong> — ils ne sont jamais bloqués. Pour
                en obtenir davantage dès maintenant, contactez la plateforme.
              </Alert>
            ) : quota.ratio >= WARN_RATIO ? (
              <Alert tone="warning">
                Il vous reste {quota.remaining.toLocaleString('fr-FR')} SMS. Au-delà, seules les alertes s’arrêtent.
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <SenderForm
            action={saveSenderAction.bind(null, slug)}
            name={sender.name}
            usePlatform={sender.usePlatform}
            platformSender={sender.platformSender}
            approved={sender.status === 'APPROVED'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Faire valider votre nom</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              L’opérateur valide chaque nom à la main, sur dossier. Une seule case vide et il refuse&nbsp;: l’application
              vérifie tout avant de produire le fichier.
            </p>
          </div>

          {missing.length > 0 ? (
            <Alert tone="error">
              Il manque&nbsp;:
              <ul className="ml-4 list-disc">
                {missing.map((m) => (
                  <li key={m.field}>
                    {m.field} — <span className="text-[color:var(--muted-foreground)]">{m.where}</span>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : (
            <>
              <Alert tone="success">Le dossier est complet.</Alert>
              <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: 'var(--surface)' }}>
                <p className="mb-1 font-semibold">Ce que l’opérateur recevra</p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Nom demandé :</span> {row?.['SENDER ID']}
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Vitrine :</span> {row?.['Website du sender']}
                </p>
                <p className="mt-1 text-[color:var(--muted-foreground)]">Exemples de messages :</p>
                <ul className="ml-4 list-disc">
                  {exemples(row?.['SENDER ID'] ?? '').map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/e/${slug}/parametres/sms/dossier`} download>
                  <Button variant="secondary" size="sm">
                    Télécharger le dossier
                  </Button>
                </a>
                <SimpleSubmit
                  action={markSenderRequestedAction.bind(null, slug)}
                  label="J’ai envoyé le dossier"
                  small
                />
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer font-medium">Voir le texte de l’e-mail</summary>
                <p className="mt-1 whitespace-pre-wrap rounded-xl border p-2" style={{ backgroundColor: 'var(--surface)' }}>
                  <strong>Objet :</strong> {mail.subject}
                  {'\n\n'}
                  {mail.body}
                </p>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {sender.status !== 'NONE' || sender.name ? (
        <Card>
          <CardContent>
            <SenderStatusForm action={setSenderStatusAction.bind(null, slug)} status={sender.status} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
