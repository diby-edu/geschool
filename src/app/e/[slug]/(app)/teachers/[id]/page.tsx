import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getTeacher } from '@/features/teachers/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeacherForm } from '@/features/teachers/components/TeacherForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateTeacherAction, archiveTeacherAction } from '@/features/teachers/actions';

export const metadata: Metadata = { title: "Modifier l'enseignant" };

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.update');

  const teacher = await getTeacher(ctx, id);
  if (!teacher) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`${teacher.last_name.toUpperCase()} ${teacher.first_name}`}
        description={`Matricule ${teacher.staff_number}`}
        action={
          <Link href={`/e/${slug}/teachers`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <TeacherForm
        action={updateTeacherAction.bind(null, slug, id)}
        submitLabel="Enregistrer"
        defaultValues={{
          staffNumber: teacher.staff_number,
          firstName: teacher.first_name,
          lastName: teacher.last_name,
          gender: teacher.gender ?? '',
          phone: teacher.phone_e164 ?? '',
          email: teacher.email ?? '',
          specialty: teacher.specialty ?? '',
          employmentType: teacher.employment_type,
          status: teacher.status,
        }}
      />

      {hasPermission(ctx, 'teachers.delete') ? (
        <div className="rounded-[--radius-card] border border-dashed p-4">
          <p className="mb-2 text-sm font-medium">Archiver cet enseignant</p>
          <p className="mb-3 text-sm text-[color:var(--muted-foreground)]">
            L&apos;enseignant est retire des listes mais son historique (emplois du temps, notes)
            est conserve.
          </p>
          <ConfirmSubmit
            action={archiveTeacherAction.bind(null, slug, id)}
            label="Archiver"
            confirmMessage={`Archiver « ${teacher.first_name} ${teacher.last_name} » ?`}
          />
        </div>
      ) : null}
    </div>
  );
}
