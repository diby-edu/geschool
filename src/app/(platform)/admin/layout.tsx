import { notFound } from 'next/navigation';
import { getAuthenticatedUser, createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Espace Super Admin (ADR-007). Garde stricte : reservee aux administrateurs
 * plateforme, tout autre visiteur obtient un 404. Aucune donnee n'est chargee
 * avant cette verification.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) notFound();

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) notFound();

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? user.email ?? 'Super Admin';

  return (
    <AppShell
      brand="Plateforme"
      subtitle="Administration globale"
      nav={[{ href: '/admin', label: "Etablissements" }]}
      user={{ displayName, roleLabel: 'Super Admin' }}
    >
      {children}
    </AppShell>
  );
}
