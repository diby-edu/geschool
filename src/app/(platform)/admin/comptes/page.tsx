import type { Metadata } from 'next';
import Link from 'next/link';
import { listPlatformUsers, matchesFilter, ACCOUNT_FILTERS, type AccountFilter } from '@/features/platform/users';
import { listOrphanAccounts } from '@/features/platform/account-sheet';
import { deleteOrphanAccountAction } from '@/features/platform/account-actions';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { FilterPill } from '@/components/ui/filters';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Comptes — plateforme' };
export const dynamic = 'force-dynamic';

const FILTER_LABEL: Record<AccountFilter | 'ORPHAN', string> = {
  STAFF: 'Direction et personnel',
  TEACHER: 'Enseignants',
  GUARDIAN: 'Parents',
  NEVER: 'Jamais connectés',
  LOCKED: 'Bloqués',
  SUSPENDED: 'Suspendus',
  ORPHAN: 'Sans école',
};

const jour = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const phone = (p: string | null) => (p ? formatPhoneForDisplay(p, 'CI') : null);

/**
 * Tous les comptes de la plateforme (lot 4, maquette
 * docs/maquettes/super-admin-comptes.html) : filtres, état de chaque compte et
 * accès à sa fiche, où se font les actions.
 */
export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const recherche = typeof sp.q === 'string' ? sp.q : '';
  const filtre = [...ACCOUNT_FILTERS, 'ORPHAN' as const].find((f) => f === sp.f);
  const [all, orphans] = await Promise.all([listPlatformUsers(recherche, 100_000), listOrphanAccounts()]);
  const users = filtre && filtre !== 'ORPHAN' ? all.filter((u) => matchesFilter(u, filtre)) : all;
  const shown = users.slice(0, 200);

  const href = (f?: string) => {
    const q = new URLSearchParams();
    if (recherche) q.set('q', recherche);
    if (f) q.set('f', f);
    const s = q.toString();
    return `/admin/comptes${s ? `?${s}` : ''}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Comptes"
        description="Tous les comptes de la plateforme, quelle que soit leur école. Ouvrez un compte pour le débloquer, lui remettre des identifiants ou le suspendre."
        action={
          <Link href="/admin">
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />
      {sp.supprime ? <Alert tone="success">Compte supprimé.</Alert> : null}

      <Card>
        <CardContent className="space-y-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            {filtre ? <input type="hidden" name="f" value={filtre} /> : null}
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium">Chercher</span>
              <Input name="q" defaultValue={recherche} placeholder="Nom, e-mail, téléphone ou établissement" />
            </label>
            <Button type="submit" variant="secondary">
              Chercher
            </Button>
            {recherche ? (
              <Link href={href(filtre)}>
                <Button variant="ghost">Effacer</Button>
              </Link>
            ) : null}
          </form>
          <div className="flex flex-wrap gap-2">
            <FilterPill href={href()} label="Tous" value={all.length} active={!filtre} />
            {ACCOUNT_FILTERS.map((f) => (
              <FilterPill key={f} href={href(f)} label={FILTER_LABEL[f]} value={all.filter((u) => matchesFilter(u, f)).length} active={filtre === f} />
            ))}
            <FilterPill href={href('ORPHAN')} label={FILTER_LABEL.ORPHAN} value={orphans.length} active={filtre === 'ORPHAN'} />
          </div>
        </CardContent>
      </Card>

      {filtre === 'ORPHAN' ? (
        orphans.length === 0 ? (
          <EmptyState title="Aucun compte sans école" hint="Tous les comptes sont rattachés à une école." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                      <th className="p-3">Compte</th>
                      <th className="p-3">Créé le</th>
                      <th className="p-3">Dernière connexion</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {orphans.map((o) => (
                      <tr key={o.id} className="border-b align-top">
                        <td className="p-3">
                          <div className="font-medium">{o.email ?? '(sans nom)'}</div>
                          {o.email ? null : <div className="text-xs text-[color:var(--muted-foreground)]">compte sans e-mail réel</div>}
                        </td>
                        <td className="p-3">{jour(o.createdAt)}</td>
                        <td className="p-3">{o.lastLogin ? jour(o.lastLogin) : 'jamais'}</td>
                        <td className="p-3 text-right">
                          <ConfirmSubmit
                            action={deleteOrphanAccountAction.bind(null, o.id)}
                            label="Supprimer"
                            variant="secondary"
                            confirmMessage="Supprimer ce compte ? Il n’est rattaché à aucune école et n’a aucune donnée. C’est définitif."
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      ) : users.length === 0 ? (
        <EmptyState
          title="Aucun compte"
          hint={recherche || filtre ? 'Aucun résultat pour cette recherche.' : 'Les comptes apparaîtront ici.'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    <th className="p-3">Personne</th>
                    <th className="p-3">Établissement et fonction</th>
                    <th className="p-3">Connexion</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <tr key={u.id} className="border-b align-top">
                      <td className="p-3">
                        <div className="font-medium">{u.name}</div>
                        {u.email ? <div className="text-xs text-[color:var(--muted-foreground)]">{u.email}</div> : null}
                        {u.phone ? <div className="text-xs text-[color:var(--muted-foreground)]">{phone(u.phone)}</div> : null}
                      </td>
                      <td className="p-3">
                        {u.schools.map((s) => (
                          <div key={s.slug} className="text-xs">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-[color:var(--muted-foreground)]">
                              {' '}
                              — {s.roles.map((r) => roleLabel(r as RoleCode)).join(', ') || 'sans fonction'}
                              {s.status !== 'ACTIVE' ? ' · suspendu' : ''}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="p-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {u.locked ? <Pill tone="bad">Bloqué (essais ratés)</Pill> : null}
                          {u.suspendedEverywhere ? <Pill tone="bad">Suspendu partout</Pill> : null}
                          {u.idleDays === null ? (
                            <Pill tone="warn">Jamais connecté</Pill>
                          ) : (
                            <span>{u.idleDays === 0 ? "aujourd'hui" : `il y a ${u.idleDays} j`}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/admin/comptes/${u.id}`}>
                          <Button size="sm">Ouvrir</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length > shown.length ? (
              <p className="p-3 text-xs text-[color:var(--muted-foreground)]">
                {shown.length} comptes affichés sur {users.length} : précisez la recherche.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
