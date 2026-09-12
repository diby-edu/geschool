import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getIndicators, listAccounts } from '@/features/access/queries';
import { sendAction, resetAction, bulkSendAction } from '@/features/access/actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Gestion des acces' };

const KIND: Record<string, string> = { STUDENT: 'Eleve', GUARDIAN: 'Parent', TEACHER: 'Enseignant', STAFF: 'Personnel' };

function Ind({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString('fr-FR')}</p>
        <p className="text-xs text-[color:var(--muted-foreground)]">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'access_accounts.view');

  const [ind, accounts] = await Promise.all([
    getIndicators(ctx),
    listAccounts(ctx, {
      subjectKind: typeof sp.kind === 'string' ? sp.kind : undefined,
      activation: typeof sp.activation === 'string' ? sp.activation : undefined,
    }),
  ]);
  const canSend = hasPermission(ctx, 'access_accounts.send');
  const canReset = hasPermission(ctx, 'access_accounts.reset');
  const canBulk = hasPermission(ctx, 'access_accounts.bulk_send');

  const flash =
    sp.sent === '1' ? 'Identifiants envoyes.' : sp.reset === '1' ? 'Acces reinitialise et envoye.' : sp.bulk === '1' ? 'Envoi groupe traite.' : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <PageHeader
        title="Gestion des acces"
        description="Comptes, activation et transmission des identifiants."
        action={
          canBulk && ind.pending > 0 ? (
            <SimpleSubmit action={bulkSendAction.bind(null, slug)} label={`Envoyer les ${ind.pending} en attente`} />
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Ind label="Comptes eleves" value={ind.students} />
        <Ind label="Comptes parents" value={ind.guardians} />
        <Ind label="Actives" value={ind.activated} />
        <Ind label="Non actives" value={ind.notActivated} />
        <Ind label="SMS en attente" value={ind.pending} />
        <Ind label="SMS envoyes" value={ind.sent} />
        <Ind label="SMS en echec" value={ind.failed} />
      </div>

      <div className="overflow-x-auto rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[color:var(--muted-foreground)]">
              <th className="px-3 py-2 font-medium">Compte</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Identifiant</th>
              <th className="px-3 py-2 font-medium">Activation</th>
              {canSend || canReset ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[color:var(--muted-foreground)]">
                  Aucun compte.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.user_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{a.name}</td>
                  <td className="px-3 py-2">{KIND[a.subject_kind] ?? a.subject_kind}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.login_identifier}</td>
                  <td className="px-3 py-2">
                    {a.activation_status === 'ACTIVATED' ? (
                      <span className="text-[color:var(--color-success)]">Active</span>
                    ) : (
                      <span className="text-[color:var(--muted-foreground)]">Non active</span>
                    )}
                  </td>
                  {canSend || canReset ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {canSend && a.has_pending ? (
                          <SimpleSubmit action={sendAction.bind(null, slug, a.user_id)} label="Envoyer" small />
                        ) : null}
                        {canReset && a.activation_status === 'ACTIVATED' ? (
                          <ConfirmSubmit
                            action={resetAction.bind(null, slug, a.user_id)}
                            label="Reinitialiser"
                            variant="secondary"
                            confirmMessage={`Reinitialiser l'acces de ${a.name} ? Un nouveau mot de passe temporaire lui sera envoye.`}
                          />
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
