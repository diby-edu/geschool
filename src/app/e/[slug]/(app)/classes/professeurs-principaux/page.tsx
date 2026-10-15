import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { loadHeadTeacherBoard } from '@/features/classes/service';
import { saveHeadTeachersAction } from '@/features/classes/actions';
import { HeadTeachersForm } from '@/features/classes/components/HeadTeachersForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Professeurs principaux' };

/**
 * Désigner les professeurs principaux de toutes les classes sur une seule
 * page. Sans professeur principal, une classe ne peut pas être certifiée
 * avant le conseil.
 */
export default async function HeadTeachersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.view');
  if (!ctx.academicYear) {
    return <EmptyState title="Aucune année scolaire active" hint="Activez une année scolaire pour gérer les classes." />;
  }
  const { rows, teachers } = await loadHeadTeacherBoard(ctx);
  const canEdit = hasPermission(ctx, 'classes.update');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Professeurs principaux"
        description="Le professeur principal vérifie les moyennes de sa classe avec ses élèves, puis la certifie avant le conseil."
        action={
          <Link href={`/e/${slug}/classes`}>
            <Button variant="ghost">Retour aux classes</Button>
          </Link>
        }
      />
      {typeof sp.enregistre === 'string' ? <Alert tone="success">{sp.enregistre} classe(s) mise(s) à jour.</Alert> : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucune classe" hint="Créez d’abord les classes de l’année." />
      ) : canEdit ? (
        <HeadTeachersForm action={saveHeadTeachersAction.bind(null, slug)} rows={rows} teachers={teachers} />
      ) : (
        <Alert tone="info">Vous pouvez consulter les classes, mais pas désigner leurs professeurs principaux.</Alert>
      )}
    </div>
  );
}
