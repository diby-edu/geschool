import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { mergeQuery, pageCount, parseListParams } from '@/lib/query/list';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { AUDIT_MODULES, listAudit, type AuditRow } from '@/features/audit/queries';
import { actionLabel, moduleLabel, summarize } from '@/features/audit/labels';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Journal d’audit' };

const PAGE_SIZE = 25;
const WHEN = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'audit.view');

  const base = `/e/${slug}/audit`;
  const rawModule = Array.isArray(sp.module) ? sp.module[0] : sp.module;
  const domain = rawModule && AUDIT_MODULES.includes(rawModule) ? rawModule : undefined;
  const listParams = parseListParams(sp, { sortable: [], pageSize: PAGE_SIZE });

  const { rows, total } = await listAudit(ctx, domain, listParams);
  const pages = pageCount(total, PAGE_SIZE);
  if (listParams.page > pages) redirect(`${base}${mergeQuery(sp, { page: pages })}`);

  const columns: Column<AuditRow>[] = [
    {
      key: 'when',
      header: 'Date',
      render: (r) => <span className="whitespace-nowrap tabular-nums">{WHEN.format(new Date(r.createdAt))}</span>,
    },
    {
      key: 'action',
      header: 'Événement',
      render: (r) => (
        <span className="block">
          <span className="block font-medium">{actionLabel(r.action)}</span>
          <span className="block text-xs text-[color:var(--muted-foreground)]">{moduleLabel(r.module)}</span>
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Par',
      render: (r) => (
        <span className="block text-sm">
          <span className="block">{r.actor ?? (r.platformAdmin ? 'Plateforme' : 'Système')}</span>
          {r.actorRole ? (
            <span className="block text-xs text-[color:var(--muted-foreground)]">
              {roleLabel(r.actorRole as RoleCode) === r.actorRole ? r.actorRole : roleLabel(r.actorRole as RoleCode)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Détail',
      render: (r) => <span className="text-xs text-[color:var(--muted-foreground)]">{summarize(r.after) || '—'}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Journal d’audit"
        description="Qui a fait quoi, et quand. Le journal est en lecture seule : personne ne peut le modifier."
        action={
          <Link href={`/e/${slug}/parametres`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux paramètres
          </Link>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="module" className="mb-1 block text-sm font-medium">
            Domaine
          </label>
          <select
            id="module"
            name="module"
            defaultValue={domain ?? ''}
            className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
          >
            <option value="">Tous les domaines</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m} value={m}>
                {moduleLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Filtrer
        </Button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        emptyLabel={domain ? 'Aucun événement dans ce domaine.' : 'Aucun événement enregistré.'}
      />
    </div>
  );
}
