import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listYearClasses } from '@/features/assignments/queries';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';
import { listLanguages } from '@/features/groups/language';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { EnrollForm } from '@/features/students/components/EnrollForm';
import { enrollAction } from '@/features/students/actions';

export const metadata: Metadata = { title: 'Inscrire un élève' };

export default async function EnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.create');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Inscrire un élève" />
        <EmptyState title="Aucune année scolaire active" hint="Activez une année d'abord." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }

  const [classes, policy, languages] = await Promise.all([
    listYearClasses(ctx, ctx.academicYear.id),
    enrollmentPolicy(ctx),
    listLanguages(ctx, ctx.academicYear.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Inscrire un élève"
        description="L'élève et les comptes de ses responsables sont créés automatiquement."
        action={
          <Link href={`/e/${slug}/students`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      {classes.length === 0 ? (
        <EmptyState title="Aucune classe" hint="Créez d'abord une classe pour y inscrire l'élève." />
      ) : (
        <EnrollForm
          action={enrollAction.bind(null, slug)}
          classes={classes}
          matriculeRequired={matriculeIsRequired(policy)}
          languages={languages}
        />
      )}
    </div>
  );
}
