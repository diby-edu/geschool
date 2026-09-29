import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getGroup, groupRoster } from '@/features/groups/service';
import { groupKindLabel } from '@/features/groups/kinds';
import { listYearClasses, listActiveSubjects } from '@/features/assignments/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { listGroupAssignments } from '@/features/assignments/service';
import { createGroupAssignmentAction, deleteGroupAssignmentAction } from '@/features/assignments/actions';
import { GroupTeacherForm } from '@/features/groups/components/GroupTeacherForm';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { Card, CardContent } from '@/components/ui/card';
import { updateGroupAction, deleteGroupAction, setGroupMembersAction } from '@/features/groups/actions';
import { GroupForm } from '@/features/groups/components/GroupForm';
import { RosterForm } from '@/features/groups/components/RosterForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Groupe' };

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'groups.view');

  const group = await getGroup(ctx, id);
  if (!group) notFound();
  if (!ctx.academicYear) notFound();

  const [roster, classes, subjects, teachers, assignments] = await Promise.all([
    groupRoster(ctx, id, ctx.academicYear.id),
    listYearClasses(ctx, ctx.academicYear.id),
    listActiveSubjects(ctx),
    listActiveTeachers(ctx),
    listGroupAssignments(ctx, id),
  ]);

  const canUpdate = hasPermission(ctx, 'groups.update');
  const canAssign = hasPermission(ctx, 'groups.assign_students');
  const canDelete = hasPermission(ctx, 'groups.delete');
  const canTeach = hasPermission(ctx, 'assignments.manage');
  const added = typeof sp.ajoutes === 'string' ? Number(sp.ajoutes) : null;
  const removed = typeof sp.retires === 'string' ? Number(sp.retires) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.cree === '1' ? <Alert tone="success">Groupe créé. Choisissez maintenant ses élèves.</Alert> : null}
      {sp.enregistre === '1' ? <Alert tone="success">Groupe enregistré.</Alert> : null}
      {sp.affecte === '1' ? <Alert tone="success">Enseignant affecté à ce groupe.</Alert> : null}
      {sp.retire === '1' ? <Alert tone="success">Affectation retirée.</Alert> : null}
      {added !== null && removed !== null ? (
        <Alert tone="success">
          Composition enregistrée : {added} ajouté(s), {removed} retiré(s).
        </Alert>
      ) : null}

      <PageHeader
        title={group.name}
        description={`${groupKindLabel(group.kind)}${group.subject_name ? ` · ${group.subject_name}` : ''} · ${group.members} élève(s)`}
        action={
          <Link href={`/e/${slug}/groupes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Composition
        </h2>
        {group.classes.length === 0 ? (
          <Alert tone="info">
            Ce groupe n’est rattaché à aucune classe : aucun élève ne peut y entrer. Ajoutez au moins une classe
            ci-dessous.
          </Alert>
        ) : (
          <RosterForm
            action={setGroupMembersAction.bind(null, slug, id)}
            students={roster}
            editable={canAssign}
            maxSize={group.max_size}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Qui enseigne à ce groupe
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Aucun enseignant. Tant que le groupe n’en a pas, l’emploi du temps ne peut pas lui faire cours.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.teacherName}</p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {a.subjectName}
                        {a.weeklyMinutes > 0 ? ` · ${a.weeklyMinutes} min/semaine` : ''}
                      </p>
                    </div>
                    {canTeach ? (
                      <SimpleSubmit
                        action={deleteGroupAssignmentAction.bind(null, slug, id, a.id)}
                        label="Retirer"
                        small
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canTeach ? (
          <Card>
            <CardContent className="py-3">
              <GroupTeacherForm
                action={createGroupAssignmentAction.bind(null, slug, id)}
                teachers={teachers}
                subjects={subjects}
                defaultSubjectId={group.subject_id ?? ''}
              />
            </CardContent>
          </Card>
        ) : null}
      </section>

      {canUpdate ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Réglages du groupe
          </h2>
          <GroupForm
            action={updateGroupAction.bind(null, slug, id)}
            classes={classes}
            subjects={subjects}
            defaults={{
              code: group.code,
              name: group.name,
              kind: group.kind,
              subjectId: group.subject_id ?? '',
              maxSize: group.max_size === null ? '' : String(group.max_size),
              classIds: group.classes.map((c) => c.id),
            }}
            submitLabel="Enregistrer"
          />
        </section>
      ) : null}

      {canDelete ? (
        <div className="rounded-[--radius-card] border border-dashed p-4">
          <p className="mb-2 text-sm font-medium">Supprimer ce groupe</p>
          <ConfirmSubmit
            action={deleteGroupAction.bind(null, slug, id)}
            label="Supprimer"
            confirmMessage={`Supprimer le groupe « ${group.name} » ?`}
          />
        </div>
      ) : null}
    </div>
  );
}
