import type { Metadata } from 'next';
import Link from 'next/link';
import { listPlatformUsers } from '@/features/platform/users';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = { title: 'Comptes — plateforme' };
export const dynamic = 'force-dynamic';

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const recherche = typeof sp.q === 'string' ? sp.q : '';
  const users = await listPlatformUsers(recherche);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Comptes"
        description="Tous les comptes de la plateforme, quelle que soit leur école."
        action={
          <Link href="/admin">
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium">Chercher</span>
              <Input name="q" defaultValue={recherche} placeholder="Nom, e-mail, téléphone ou établissement" />
            </label>
            <Button type="submit" variant="secondary">
              Chercher
            </Button>
            {recherche ? (
              <Link href="/admin/comptes">
                <Button variant="ghost">Effacer</Button>
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <EmptyState
          title="Aucun compte"
          hint={recherche ? 'Aucun résultat pour cette recherche.' : 'Les comptes apparaîtront ici.'}
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
                    <th className="p-3 text-right">Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b align-top">
                      <td className="p-3">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-[color:var(--muted-foreground)]">
                          {u.email ?? u.phone ?? '—'}
                        </div>
                        {u.suspendedEverywhere ? (
                          <div className="text-xs" style={{ color: 'var(--color-danger)' }}>
                            Suspendu partout
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {u.schools.map((s) => (
                          <div key={s.slug} className="text-xs">
                            <Link href={`/e/${s.slug}/access`} className="font-medium hover:underline">
                              {s.name}
                            </Link>
                            <span className="text-[color:var(--muted-foreground)]">
                              {' '}
                              — {s.roles.map((r) => roleLabel(r as RoleCode)).join(', ') || 'sans fonction'}
                              {s.status !== 'ACTIVE' ? ' · suspendu' : ''}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="p-3 text-right text-xs">
                        {u.idleDays === null ? (
                          <span style={{ color: 'var(--color-warning)' }}>jamais connecté</span>
                        ) : u.idleDays === 0 ? (
                          "aujourd'hui"
                        ) : (
                          `il y a ${u.idleDays} j`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-[color:var(--muted-foreground)]">
        La suspension d’un compte se fait depuis l’établissement concerné — c’est lui qui décide qui entre chez lui. Le
        lien sur le nom de l’école y mène directement.
      </p>
    </div>
  );
}
