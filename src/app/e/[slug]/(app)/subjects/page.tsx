import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listSubjects, SUBJECT_SORTABLE, type SubjectRow } from '@/features/subjects/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Matieres' };

export default async function SubjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.view');

  const listParams = parseListParams(sp, { sortable: SUBJECT_SORTABLE, defaultSort: 'name' });
  const { rows, total } = await listSubjects(ctx, listParams);
  const base = `/e/${slug}/subjects`;
  const canEdit = hasPermission(ctx, 'subjects.update');

  const columns: Column<SubjectRow>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono">{r.code}</span> },
    { key: 'name', header: 'Nom', sortable: true, render: (r) => r.name },
    {
      key: 'default_coefficient',
      header: 'Coef.',
      sortable: true,
      align: 'right',
      render: (r) => r.default_coefficient,
    },
    {
      key: 'is_active',
      header: 'Statut',
      render: (r) =>
        r.is_active ? (
          <span className="text-[color:var(--color-success)]">Active</span>
        ) : (
          <span className="text-[color:var(--muted-foreground)]">Inactive</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Matieres"
        description="Les matieres enseignees dans l'etablissement."
        action={
          hasPermission(ctx, 'subjects.create') ? (
            <Link href={`${base}/new`}>
              <Button>Nouvelle matiere</Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-4">
        <SearchBar
          basePath={base}
          defaultValue={listParams.q}
          placeholder="Rechercher par nom ou code…"
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
        emptyLabel="Aucune matiere. Creez-en une pour commencer."
      />
    </div>
  );
}
