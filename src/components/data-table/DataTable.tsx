import Link from 'next/link';
import { cn } from '@/lib/utils';
import { mergeQuery, pageCount, type ListParams } from '@/lib/query/list';

export type Column<Row> = {
  key: string;
  header: string;
  /** colonne triable : passe le nom exact utilise cote requete */
  sortable?: boolean;
  align?: 'left' | 'right';
  className?: string;
  render: (row: Row) => React.ReactNode;
};

/**
 * Tableau serveur : tri par en-tete (liens URL), pagination, et une ligne
 * cliquable optionnelle. Presentationnel — la requete et la pagination sont
 * faites par la page qui l'utilise (Server Component). Aucune donnee au-dela de
 * la page courante n'atteint le navigateur (§62).
 */
export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  total,
  params,
  basePath,
  searchParams,
  rowHref,
  emptyLabel = 'Aucun resultat',
}: {
  columns: Column<Row>[];
  rows: Row[];
  total: number;
  params: ListParams;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  rowHref?: ((row: Row) => string) | undefined;
  emptyLabel?: string | undefined;
}) {
  const pages = pageCount(total, params.pageSize);

  const sortLink = (col: Column<Row>): string => {
    const nextDir = params.sort === col.key && params.dir === 'asc' ? 'desc' : 'asc';
    return `${basePath}${mergeQuery(searchParams, { sort: col.key, dir: nextDir, page: 1 })}`;
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-[color:var(--muted-foreground)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn('px-3 py-2 font-medium', col.align === 'right' && 'text-right', col.className)}
                  aria-sort={
                    params.sort === col.key ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {col.sortable ? (
                    <Link href={sortLink(col)} className="inline-flex items-center gap-1 hover:underline">
                      {col.header}
                      <span aria-hidden className="text-xs">
                        {params.sort === col.key ? (params.dir === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </Link>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-[color:var(--muted-foreground)]">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-[color:var(--color-brand-muted)]">
                    {columns.map((col, i) => {
                      const content = col.render(row);
                      return (
                        <td
                          key={col.key}
                          className={cn('px-3 py-2', col.align === 'right' && 'text-right', col.className)}
                        >
                          {href && i === 0 ? (
                            <Link href={href} className="font-medium hover:underline">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
          <p className="text-[color:var(--muted-foreground)]">
            {total.toLocaleString('fr-FR')} resultat{total > 1 ? 's' : ''} · page {params.page} / {pages}
          </p>
          <div className="flex gap-1">
            <PageLink
              disabled={params.page <= 1}
              href={`${basePath}${mergeQuery(searchParams, { page: params.page - 1 })}`}
              label="Precedent"
            />
            <PageLink
              disabled={params.page >= pages}
              href={`${basePath}${mergeQuery(searchParams, { page: params.page + 1 })}`}
              label="Suivant"
            />
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled) {
    return (
      <span className="rounded-[--radius-card] border px-3 py-1.5 text-[color:var(--muted-foreground)] opacity-50">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="rounded-[--radius-card] border px-3 py-1.5 hover:bg-[color:var(--color-brand-muted)]">
      {label}
    </Link>
  );
}
