import { notFound } from 'next/navigation';
import { getAuthenticatedUser, createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { countOpenRequests } from '@/features/support/requests';

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

  // Les demandes sans réponse se voient dans le menu, sans ouvrir la page.
  const open = await countOpenRequests();

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? user.email ?? 'Super Admin';

  return (
    <AppShell
      brand="Plateforme"
      subtitle="Administration globale"
      nav={[
        { href: '/admin', label: 'Tableau de bord', icon: 'dashboard' },
        { href: '/admin/statistiques', label: 'Statistiques', section: 'Pilotage', icon: 'notes' },
        { href: '/admin/sante', label: 'Santé des écoles', section: 'Pilotage', icon: 'presences' },
        { href: '/admin/usage', label: 'Usage', section: 'Pilotage', icon: 'edt' },
        { href: '/admin/etablissements', label: 'Établissements', section: 'Écoles', icon: 'eleves' },
        { href: '/admin/comptes', label: 'Comptes', section: 'Écoles', icon: 'acces' },
        { href: '/admin/paiements', label: 'Paiements', section: 'Argent', icon: 'bulletins' },
        { href: '/admin/plans', label: 'Plans et modules', section: 'Argent', icon: 'parametres' },
        { href: '/admin/messages', label: 'Messages aux écoles', section: 'Service', icon: 'annonces' },
        { href: '/admin/demandes', label: open > 0 ? `Demandes des écoles (${open})` : 'Demandes des écoles', section: 'Service', icon: 'notifications' },
        { href: '/admin/sms', label: 'SMS', section: 'Service', icon: 'annonces' },
        { href: '/admin/reglages', label: 'Réglages', section: 'Plateforme', icon: 'parametres' },
        { href: '/admin/fonctions', label: 'Modèles des fonctions', section: 'Plateforme', icon: 'personnel' },
        { href: '/admin/technique', label: 'Technique', section: 'Plateforme', icon: 'parametres' },
        { href: '/admin/administrateurs', label: 'Administrateurs', section: 'Sécurité', icon: 'personnel' },
        { href: '/admin/journal', label: 'Journal', section: 'Sécurité', icon: 'notifications' },
      ]}
      user={{ displayName, roleLabel: 'Super Admin' }}
    >
      {children}
    </AppShell>
  );
}
