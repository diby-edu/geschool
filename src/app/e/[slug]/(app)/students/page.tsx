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

export const metadata: Metadata = { title: 'Élèves' };

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
        <PageHeader title="Élèves" />
        <EmptyState title="Aucune année scolaire active" hint="Activez une année pour inscrire des élèves." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }

  const listParams = parseListParams(sp, { sortable: STUDENT_SORTABLE, defaultSort: 'last_name' });
  const askedAssigned = typeof sp.statut === 'string' ? sp.statut : '';
  const assigned = askedAssigned === 'affecte' || askedAssigned === 'non-affecte' ? askedAssigned : undefined;
  const { rows, total } = await listStudents(ctx, ctx.academicYear.id, listParams, {
    ...(assigned ? { assigned } : {}),
  });
  const canView = hasPermission(ctx, 'students.view');

  const columns: Column<StudentRow>[] = [
    { key: 'last_name', header: 'Nom', render: (r) => `${r.last_name.toUpperCase()} ${r.first_name}` },
    { key: 'matricule', header: 'Matricule', render: (r) => <span className="font-mono">{r.matricule}</span> },
    { key: 'class_name', header: 'Classe', render: (r) => r.class_name ?? '—' },
    {
      key: 'is_state_assigned',
      header: 'Statut',
      render: (r) => (
        <span className={r.is_state_assigned === null ? 'text-[color:var(--muted-foreground)]' : ''}>
          {r.is_state_assigned === null ? 'Non renseigné' : r.is_state_assigned ? 'Affecté' : 'Non affecté'}
          {r.is_repeating ? ' · redoublant' : ''}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Élèves"
        description={`Année ${ctx.academicYear.name}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`${base}/reinscription`}>
                <Button variant="ghost">Réinscription</Button>
              </Link>
            ) : null}
            {hasPermission(ctx, 'students.export') ? (
              // Route de telechargement (pas une page) : un <a> simple, sans prefetch.
              <a href={`${base}/export${listParams.q ? `?q=${encodeURIComponent(listParams.q)}` : ''}`} download>
                <Button variant="secondary">
                  {listParams.q ? 'Exporter cette recherche (CSV)' : 'Exporter la liste (CSV)'}
                </Button>
              </a>
            ) : null}
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`/e/${slug}/import?type=students`}>
                <Button variant="secondary">Importer / exporter</Button>
              </Link>
            ) : null}
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`${base}/new`}>
                <Button>Inscrire un élève</Button>
              </Link>
            ) : null}
          </div>
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
        emptyLabel="Aucun élève inscrit."
      />
    </div>
  );
}
