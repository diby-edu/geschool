import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { listBulletinsForPrint } from '@/features/bulletins/queries';
import { bulletinRender } from '@/features/bulletins/render';
import { BulletinView } from '@/features/bulletins/components/BulletinView';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { EmptyState } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Bulletins à imprimer' };

/**
 * Toute une classe, prête à sortir en PDF.
 *
 * Pas de fichier fabriqué sur le serveur : la page est mise en forme pour l'A4
 * et l'impression du navigateur produit le PDF. Un bulletin par feuille,
 * strictement le même que celui affiché à l'écran et vu par la famille.
 */
export default async function PrintBulletinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'reports.print');
  requireFeature(ctx, 'bulletins');

  const classId = typeof sp.class === 'string' ? sp.class : '';
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  const retour = `/e/${slug}/bulletins${classId && periodId ? `?class=${classId}&period=${periodId}` : ''}`;

  if (!classId || !periodId) {
    return (
      <EmptyState title="Classe et période manquantes" hint="Revenez à la liste et choisissez une classe et une période." />
    );
  }

  const [bulletins, rendu] = await Promise.all([
    listBulletinsForPrint(ctx, classId, periodId),
    bulletinRender(ctx),
  ]);

  if (bulletins.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="Aucun bulletin" hint="Générez d’abord les bulletins de cette classe pour cette période." />
        <Link href={retour}>
          <Button variant="ghost">Retour</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{bulletins.length} bulletin(s)</strong> — {bulletins[0]!.klass} · {bulletins[0]!.period}.
          <br />
          <span className="text-[color:var(--muted-foreground)]">
            Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ». Un bulletin par page.
          </span>
        </p>
        <div className="flex gap-2">
          <PrintButton />
          <Link href={retour}>
            <Button variant="ghost">Retour</Button>
          </Link>
        </div>
      </div>

      {bulletins.map((b, i) => (
        <div key={b.id} style={{ breakAfter: i < bulletins.length - 1 ? 'page' : 'auto' }}>
          <BulletinView b={b} {...rendu} />
        </div>
      ))}
    </div>
  );
}
