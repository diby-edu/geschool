import type { Metadata } from 'next';
import { listPlatformAdmins } from '@/features/platform/admin';
import { grantPlatformAdminAction, revokePlatformAdminAction } from '@/features/platform/actions';
import { AdminGrantForm } from '@/features/platform/components/AdminGrantForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Administrateurs' };
export const dynamic = 'force-dynamic';

/**
 * Qui administre la plateforme. Un Super Admin voit tout, dans tous les
 * établissements : la liste doit rester courte et se relire d'un coup d'œil.
 */
export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const admins = await listPlatformAdmins();
  const active = admins.filter((a) => a.isActive);
  const past = admins.filter((a) => !a.isActive);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Administrateurs de la plateforme"
        description={`${active.length} actif${active.length > 1 ? 's' : ''}. Ils voient et modifient tous les établissements.`}
      />

      {typeof sp.ajoute === 'string' ? <Alert tone="success">Droits accordés.</Alert> : null}
      {typeof sp.retire === 'string' ? <Alert tone="success">Droits retirés.</Alert> : null}

      <section className="space-y-2">
        {active.map((a) => (
          <Card key={a.userId}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{a.displayName}</p>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {a.email} · depuis le {new Date(a.grantedAt).toLocaleDateString('fr-FR')}
                  {a.note ? ` · ${a.note}` : ''}
                </p>
              </div>
              <ConfirmSubmit
                action={revokePlatformAdminAction.bind(null, a.userId)}
                label="Retirer"
                confirmMessage={`Retirer les droits plateforme de ${a.displayName} ? Son compte reste, mais il ne verra plus les autres établissements.`}
              />
            </CardContent>
          </Card>
        ))}
      </section>

      <AdminGrantForm action={grantPlatformAdminAction} />

      {past.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Droits retirés
          </h2>
          {past.map((a) => (
            <Card key={a.userId}>
              <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
                {a.displayName} · {a.email}
                {a.revokedAt ? ` · retiré le ${new Date(a.revokedAt).toLocaleDateString('fr-FR')}` : ''}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
