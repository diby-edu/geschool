import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listStudents, STUDENT_SORTABLE, type StudentRow } from '@/features/students/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Eleves' };

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.view');
  const base = `/e/${slug}/students`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Eleves" />
        <EmptyState title="Aucune annee scolaire active" hint="Activez une annee pour inscrire des eleves." />
      </div>
    );
  }

  const listParams = parseListParams(sp, { sortable: STUDENT_SORTABLE, defaultSort: 'last_name' });
  const { rows, total } = await listStudents(ctx, ctx.academicYear.id, listParams);
  const canView = hasPermission(ctx, 'students.view');

  const columns: Column<StudentRow>[] = [
    { key: 'last_name', header: 'Nom', render: (r) => `${r.last_name.toUpperCase()} ${r.first_name}` },
    { key: 'matricule', header: 'Matricule', render: (r) => <span className="font-mono">{r.matricule}</span> },
    { key: 'class_name', header: 'Classe', render: (r) => r.class_name ?? '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Eleves"
        description={`Annee ${ctx.academicYear.name}`}
        action={
          hasPermission(ctx, 'students.create') ? (
            <Link href={`${base}/new`}>
              <Button>Inscrire un eleve</Button>
            </Link>
          ) : null
        }
      />
      <div className="mb-4">
        <SearchBar basePath={base} defaultValue={listParams.q} placeholder="Nom ou matricule…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        rowHref={canView ? (r) => `${base}/${r.id}` : undefined}
        emptyLabel="Aucun eleve inscrit."
      />
    </div>
  );
}
