import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { schoolSessionMinutes } from '@/features/teachers/service';
import { getTeacher } from '@/features/teachers/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeacherForm } from '@/features/teachers/components/TeacherForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateTeacherAction, archiveTeacherAction, createTeacherAccessAction } from '@/features/teachers/actions';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { Flash } from '@/components/ui/flash';

export const metadata: Metadata = { title: "Modifier l'enseignant" };

export default async function EditTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.update');

  const teacher = await getTeacher(ctx, id);
  // Une séance dure ce que dure un créneau : le service se lit dans cette unité.
  const sessionMinutes = await schoolSessionMinutes(ctx);
  if (!teacher) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
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
          birthDate: teacher.birth_date ?? '',
          phone: teacher.phone_e164 ?? '',
          email: teacher.email ?? '',
          address: teacher.address ?? '',
          specialty: teacher.specialty ?? '',
          employmentType: teacher.employment_type,
          status: teacher.status,
          hireDate: teacher.hire_date ?? '',
          diploma: teacher.diploma ?? '',
          diplomaDetail: teacher.diploma_detail ?? '',
          // Le service est stocké en minutes, saisi en séances.
          minSessions: teacher.weekly_minutes_min ? String(Math.round(teacher.weekly_minutes_min / sessionMinutes)) : '',
          maxSessions: teacher.weekly_minutes_max ? String(Math.round(teacher.weekly_minutes_max / sessionMinutes)) : '',
        }}
      />

      <div className="rounded-[--radius-card] border p-4" style={{ backgroundColor: 'var(--surface)' }}>
        <p className="mb-1 text-sm font-medium">Accès de connexion</p>
        {teacher.user_id ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Accès créé. Les identifiants se gèrent dans{' '}
            <Link href={`/e/${slug}/access`} className="underline">
              Gestion des accès
            </Link>
            .
          </p>
        ) : !teacher.phone_e164 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Renseignez le téléphone de l&apos;enseignant ci-dessus et enregistrez : il servira d&apos;identifiant de connexion.
          </p>
        ) : hasPermission(ctx, 'access_accounts.create') ? (
          <>
            <p className="mb-3 text-sm text-[color:var(--muted-foreground)]">
              L&apos;enseignant se connectera avec le code école <b className="font-mono">{ctx.school.loginCode}</b> et son
              téléphone. Une fois l&apos;accès créé, vous lui envoyez ses identifiants par SMS depuis{' '}
              <Link href={`/e/${slug}/access`} className="underline">
                Gestion des accès
              </Link>
              ; il choisira son mot de passe à la première connexion.
            </p>
            <SimpleSubmit action={createTeacherAccessAction.bind(null, slug, id)} label="Créer l'accès" />
          </>
        ) : (
          <p className="text-sm text-[color:var(--muted-foreground)]">Vous n&apos;avez pas le droit de créer des accès.</p>
        )}
      </div>

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
