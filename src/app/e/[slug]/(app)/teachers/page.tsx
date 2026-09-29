import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery, parseListParams } from '@/lib/query/list';
import {
  CONTRACT_FILTERS,
  countTeachersByContract,
  listTeachers,
  TEACHER_SORTABLE,
  type ContractCode,
  type TeacherRow,
} from '@/features/teachers/queries';
import { EMPLOYMENT_OPTIONS, employmentLabel, diplomaLabel } from '@/lib/hr';
import { FilterPill } from '@/components/ui/filters';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { bulkCreateTeacherAccessAction } from '@/features/teachers/actions';

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
  const rawContract = Array.isArray(sp.contrat) ? sp.contrat[0] : sp.contrat;
  const contract = CONTRACT_FILTERS.find((c): c is ContractCode => c === rawContract);
  const [{ rows, total }, byContract] = await Promise.all([
    listTeachers(ctx, listParams, contract),
    countTeachersByContract(ctx),
  ]);
  const base = `/e/${slug}/teachers`;
  const nav = Object.fromEntries(
    Object.entries(sp).filter(([k]) => !['created', 'updated', 'deleted', 'bulk', 'c', 'l', 'n', 'f', 'r'].includes(k)),
  );
  const contractHref = (c: ContractCode | undefined) => `${base}${mergeQuery(nav, { contrat: c ?? null, page: null })}`;
  const canEdit = hasPermission(ctx, 'teachers.update');
  const canCreateAccess = hasPermission(ctx, 'access_accounts.create');

  const num = (k: string) => Number(typeof sp[k] === 'string' ? sp[k] : 0) || 0;
  const bulkMessage =
    sp.bulk === '1'
      ? `Accès traités : ${num('c')} créé(s), ${num('l')} rattaché(s) à un accès existant${num('n') > 0 ? `, ${num('n')} sans téléphone` : ''}${num('f') > 0 ? `, ${num('f')} en échec` : ''}${num('r') > 0 ? `. Il en reste ${num('r')} : relancez.` : '.'}${num('c') > 0 ? ' Leurs identifiants sont en attente : envoyez-les depuis Gestion des accès.' : ''}`
      : null;

  const columns: Column<TeacherRow>[] = [
    {
      key: 'last_name',
      header: 'Nom',
      sortable: true,
      render: (r) => `${r.last_name.toUpperCase()} ${r.first_name}`,
    },
    { key: 'staff_number', header: 'Matricule', sortable: true, render: (r) => <span className="font-mono">{r.staff_number}</span> },
    { key: 'specialty', header: 'Spécialité', render: (r) => r.specialty ?? '—' },
    {
      key: 'contract',
      header: 'Contrat',
      render: (r) => (
        <span className="rounded-full border px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
          {employmentLabel(r.employment_type)}
        </span>
      ),
    },
    { key: 'diploma', header: 'Diplôme', render: (r) => (r.diploma ? diplomaLabel(r.diploma) : '—') },
    { key: 'status', header: 'Statut', render: (r) => STATUS[r.status] ?? r.status },
    {
      key: 'access',
      header: 'Accès',
      render: (r) =>
        r.user_id ? (
          <span className="text-[color:var(--color-success)]">Créé</span>
        ) : r.phone_e164 ? (
          <span className="text-[color:var(--muted-foreground)]">Non créé</span>
        ) : (
          <span className="text-[color:var(--muted-foreground)]">Téléphone à renseigner</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      {bulkMessage ? (
        <div className="mb-4">
          <Alert tone="success">{bulkMessage}</Alert>
        </div>
      ) : null}
      <PageHeader
        title="Enseignants"
        description="Le personnel enseignant de l'établissement."
        action={
          <div className="flex flex-wrap items-start justify-end gap-2">
            {canCreateAccess ? (
              <SimpleSubmit action={bulkCreateTeacherAccessAction.bind(null, slug)} label="Créer les accès manquants" />
            ) : null}
            <Link href={`${base}/service`}>
              <Button variant="secondary">Service hebdomadaire</Button>
            </Link>
            <Link href={`/e/${slug}/import?type=teachers`}>
              <Button variant="secondary">Importer / exporter</Button>
            </Link>
            {hasPermission(ctx, 'teachers.create') ? (
              <Link href={`${base}/new`}>
                <Button>Nouvel enseignant</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2" aria-label="Filtrer par type de contrat">
        <FilterPill href={contractHref(undefined)} label="Tous" value={byContract.ALL} active={!contract} />
        {EMPLOYMENT_OPTIONS.filter((o) => byContract[o.code] > 0 || contract === o.code).map((o) => (
          <FilterPill key={o.code} href={contractHref(o.code)} label={o.label} value={byContract[o.code]} active={contract === o.code} />
        ))}
      </div>

      <div className="mb-4">
        <SearchBar
          basePath={base}
          defaultValue={listParams.q}
          placeholder="Rechercher par nom ou matricule…"
          hidden={{
            ...(listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}),
            ...(contract ? { contrat: contract } : {}),
          }}
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
