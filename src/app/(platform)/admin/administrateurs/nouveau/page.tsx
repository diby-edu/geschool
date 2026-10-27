import type { Metadata } from 'next';
import Link from 'next/link';
import { createPlatformAdminAction } from '@/features/platform/actions';
import { AdminCreateForm } from '@/features/platform/components/AdminCreateForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Créer un compte Super Admin' };
export const dynamic = 'force-dynamic';

export default function NewPlatformAdminPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Créer un compte Super Admin"
        description="Un nouvel administrateur de la plateforme : il verra et pourra modifier tous les établissements."
        action={
          <Link href="/admin/administrateurs">
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />
      <Alert tone="warning">
        Un Super Admin a tous les pouvoirs sur toutes les écoles. Ne créez ce compte que pour une personne de confiance. Vous pourrez retirer ses droits à tout
        moment depuis « Administrateurs ».
      </Alert>
      <AdminCreateForm action={createPlatformAdminAction} />
    </div>
  );
}
