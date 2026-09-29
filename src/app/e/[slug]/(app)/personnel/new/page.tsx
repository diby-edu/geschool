import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { createStaffAction } from '@/features/staff/actions';
import { StaffForm } from '@/features/staff/components/StaffForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Ajouter du personnel' };

export default async function NewStaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'users.create');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Ajouter un membre du personnel"
        description="Compte du personnel administratif. La personne se connecte avec le code école et son téléphone."
        action={
          <Link href={`/e/${slug}/personnel`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      {hasPermission(ctx, 'users.assign_roles') ? (
        <StaffForm action={createStaffAction.bind(null, slug)} mode="create" submitLabel="Enregistrer" />
      ) : (
        <Alert tone="error">
          Ajouter une personne suppose de lui attribuer une fonction : il vous faut aussi le droit « Régler les droits des
          fonctions ». Demandez-le au fondateur.
        </Alert>
      )}
    </div>
  );
}
