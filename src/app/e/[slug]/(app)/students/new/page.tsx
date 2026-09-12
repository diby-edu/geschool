import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listYearClasses } from '@/features/assignments/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { EnrollForm } from '@/features/students/components/EnrollForm';
import { enrollAction } from '@/features/students/actions';

export const metadata: Metadata = { title: 'Inscrire un eleve' };

export default async function EnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.create');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Inscrire un eleve" />
        <EmptyState title="Aucune annee scolaire active" hint="Activez une annee d'abord." />
      </div>
    );
  }

  const classes = await listYearClasses(ctx, ctx.academicYear.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Inscrire un eleve"
        description="L'eleve et les comptes de ses responsables sont crees automatiquement."
        action={
          <Link href={`/e/${slug}/students`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      {classes.length === 0 ? (
        <EmptyState title="Aucune classe" hint="Creez d'abord une classe pour y inscrire l'eleve." />
      ) : (
        <EnrollForm action={enrollAction.bind(null, slug)} classes={classes} />
      )}
    </div>
  );
}
