import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listTeachers, TEACHER_SORTABLE, type TeacherRow } from '@/features/teachers/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Enseignants' };

const STATUS: Record<string, string> = {
  ACTIVE: 'Actif',
  ON_LEAVE: 'En conge',
  SUSPENDED: 'Suspendu',
  LEFT: 'Parti',
};

export default async function TeachersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.view');

  const listParams = parseListParams(sp, { sortable: TEACHER_SORTABLE, defaultSort: 'last_name' });
  const { rows, total } = await listTeachers(ctx, listParams);
  const base = `/e/${slug}/teachers`;
  const canEdit = hasPermission(ctx, 'teachers.update');

  const columns: Column<TeacherRow>[] = [
    {
      key: 'last_name',
      header: 'Nom',
      sortable: true,
      render: (r) => `${r.last_name.toUpperCase()} ${r.first_name}`,
    },
    { key: 'staff_number', header: 'Matricule', sortable: true, render: (r) => <span className="font-mono">{r.staff_number}</span> },
    { key: 'specialty', header: 'Specialite', render: (r) => r.specialty ?? '—' },
    { key: 'status', header: 'Statut', render: (r) => STATUS[r.status] ?? r.status },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Enseignants"
        description="Le personnel enseignant de l'etablissement."
        action={
          hasPermission(ctx, 'teachers.create') ? (
            <Link href={`${base}/new`}>
              <Button>Nouvel enseignant</Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-4">
        <SearchBar
          basePath={base}
          defaultValue={listParams.q}
          placeholder="Rechercher par nom ou matricule…"
          hidden={listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        rowHref={canEdit ? (r) => `${base}/${r.id}` : undefined}
        emptyLabel="Aucun enseignant."
      />
    </div>
  );
}
