import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateSchoolForm } from '@/features/platform-schools/components/CreateSchoolForm';

export const metadata: Metadata = { title: 'Nouvel etablissement' };

export default async function NewSchoolPage() {
  const user = await getAuthenticatedUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvel etablissement"
        description="Vous serez redirige vers son espace pour le configurer."
        action={
          <Link href="/admin" className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <CreateSchoolForm />
    </div>
  );
}
