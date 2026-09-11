import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { LogoutButton } from '@/features/auth/components/LogoutButton';

export const dynamic = 'force-dynamic';

/**
 * Aiguillage apres connexion. Le middleware garantit deja une session active et
 * une premiere connexion effectuee. Ici on choisit la destination :
 *   Super Admin              -> /admin
 *   un seul etablissement    -> /e/{slug}
 *   plusieurs etablissements -> choix explicite (comptes multi-appartenance)
 *   aucun                    -> compte sans acces
 */
export default async function RootPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login');

  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin === true) redirect('/admin');

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select('schools(slug, name)')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');

  // Les jointures imbriquees ne sont pas typees (Relationships vides dans les
  // types generes) : on annote explicitement la forme reelle.
  const rows = (memberships ?? []) as unknown as { schools: { slug: string; name: string } | null }[];
  const schools = rows
    .map((m) => m.schools)
    .filter((s): s is { slug: string; name: string } => s !== null);

  if (schools.length === 1) redirect(`/e/${schools[0]!.slug}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      {schools.length === 0 ? (
        <Card>
          <CardContent className="space-y-3">
            <h1 className="text-lg font-semibold">Aucun acces</h1>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Votre compte n&apos;est rattache a aucun etablissement actif. Contactez
              l&apos;administration.
            </p>
            <LogoutButton />
          </CardContent>
        </Card>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Choisissez un etablissement</h1>
          <ul className="space-y-2">
            {schools.map((s) => (
              <li key={s.slug}>
                <Link href={`/e/${s.slug}`}>
                  <Card>
                    <CardContent className="py-3 font-medium hover:underline">{s.name}</CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <LogoutButton />
        </>
      )}
    </main>
  );
}
