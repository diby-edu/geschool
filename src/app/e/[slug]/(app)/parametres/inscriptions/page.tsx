import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { enrollmentPolicy } from '@/features/settings/enrollment-policy';
import { updateEnrollmentPolicyAction } from '@/features/settings/actions';
import { EnrollmentPolicyForm } from '@/features/settings/components/EnrollmentPolicyForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Règles d’inscription' };

export default async function EnrollmentSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'settings.update');

  const policy = await enrollmentPolicy(ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {sp.updated === '1' ? <Alert tone="success">Règles d’inscription enregistrées.</Alert> : null}
      <PageHeader
        title="Règles d’inscription"
        description="Ce que le secrétariat doit saisir quand il inscrit un élève."
        action={
          <Link href={`/e/${slug}/parametres`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux paramètres
          </Link>
        }
      />

      <EnrollmentPolicyForm action={updateEnrollmentPolicyAction.bind(null, slug)} matricule={policy.matricule} />
    </div>
  );
}
