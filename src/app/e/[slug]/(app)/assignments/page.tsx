import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listAssignments, listYearClasses, listActiveSubjects } from '@/features/assignments/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { createAssignmentAction, deleteAssignmentAction } from '@/features/assignments/actions';
import { AssignmentForm } from '@/features/assignments/components/AssignmentForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Affectations' };

function hm(min: number): string {
  if (!min) return '—';
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export default async function AssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assignments.view');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Affectations" />
        <EmptyState title="Aucune annee scolaire active" hint="Activez une annee pour gerer les affectations." />
      </div>
    );
  }

  const yearId = ctx.academicYear.id;
  const [rows, classes, subjects, teachers] = await Promise.all([
    listAssignments(ctx, yearId),
    listYearClasses(ctx, yearId),
    listActiveSubjects(ctx),
    listActiveTeachers(ctx),
  ]);
  const canManage = hasPermission(ctx, 'assignments.manage');
  const ready = classes.length > 0 && subjects.length > 0 && teachers.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Affectations d'enseignement"
        description={`Qui enseigne quoi, a quelle classe · ${ctx.academicYear.name}`}
      />

      {rows.length === 0 ? (
        <EmptyState title="Aucune affectation" hint="Affectez un enseignant a une matiere et une classe ci-dessous." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[color:var(--muted-foreground)]">
                <th className="px-3 py-2 font-medium">Classe</th>
                <th className="px-3 py-2 font-medium">Matiere</th>
                <th className="px-3 py-2 font-medium">Enseignant</th>
                <th className="px-3 py-2 text-right font-medium">Volume</th>
                {canManage ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.klass}</td>
                  <td className="px-3 py-2">{r.subject}</td>
                  <td className="px-3 py-2">{r.teacher}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{hm(r.weekly_minutes)}</td>
                  {canManage ? (
                    <td className="px-3 py-2 text-right">
                      <ConfirmSubmit
                        action={deleteAssignmentAction.bind(null, slug, r.id)}
                        label="Retirer"
                        variant="secondary"
                        confirmMessage={`Retirer ${r.teacher} de ${r.subject} en ${r.klass} ?`}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        ready ? (
          <AssignmentForm
            action={createAssignmentAction.bind(null, slug)}
            teachers={teachers}
            subjects={subjects}
            classes={classes}
          />
        ) : (
          <EmptyState
            title="Prerequis manquants"
            hint="Il faut au moins une classe, une matiere et un enseignant pour creer une affectation."
          />
        )
      ) : null}
    </div>
  );
}
