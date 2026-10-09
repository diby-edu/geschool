import Link from 'next/link';
import { hasAnyPermission } from '@/lib/permissions';
import type { TenantContext } from '@/lib/tenant/context';
import { HUB_PERMISSIONS } from '../hub';
import { getActiveSpace } from '@/features/navigation/spaces';

/**
 * Retour aux Paramètres, en haut à droite des écrans de configuration.
 *
 * Ces pages s'ouvrent depuis la page Paramètres : sans ce lien, il faut passer
 * par le menu du navigateur pour revenir. Le lien n'apparaît que si la personne
 * a bien accès aux Paramètres — un enseignant qui ouvre le Programme depuis son
 * menu n'a rien à y faire.
 */
export async function BackToSettings({ ctx, label = 'Retour aux paramètres' }: { ctx: TenantContext; label?: string }) {
  if (!hasAnyPermission(ctx, HUB_PERMISSIONS)) return null;
  // L'espace Enseignant n'a pas de Paramètres, même si un droit de lecture (matières) y donnerait accès.
  if ((await getActiveSpace(ctx)) === 'teacher') return null;
  return (
    <Link
      href={`/e/${ctx.school.slug}/parametres`}
      className="text-sm text-[color:var(--muted-foreground)] hover:underline"
    >
      {label}
    </Link>
  );
}
