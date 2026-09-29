import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery, pageCount, parseListParams } from '@/lib/query/list';
import { roleLabel, STAFF_FUNCTIONS, type RoleCode } from '@/lib/permissions/roles';
import { listStaff, type StaffRow, type StaffState } from '@/features/staff/queries';
import { STATE_LABEL } from '@/features/staff/labels';
import { reactivateStaffAction, suspendStaffAction } from '@/features/staff/actions';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { FilterPill, FilterTile } from '@/components/ui/filters';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Personnel' };

const PAGE_SIZE = 20;
const STATES: readonly StaffState[] = ['ACTIVE', 'TO_ACTIVATE', 'SUSPENDED'];
const STATE_TONE: Record<StaffState, string> = {
  ACTIVE: 'text-[color:var(--color-success)]',
  TO_ACTIVATE: 'text-[color:var(--muted-foreground)]',
  SUSPENDED: 'font-medium text-[color:var(--color-danger,#c0392b)]',
};

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Minuscules sans accents : « Secrétaire » se trouve en tapant « secretaire ». */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function haystack(r: StaffRow): string {
  return fold(
    [r.name, r.identifier, r.identifierDisplay, r.email, r.staffNumber, ...r.functions.map((f) => f.label)]
      .filter(Boolean)
      .join(' '),
  );
}

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'users.view');

  const base = `/e/${slug}/personnel`;
  const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'suspended' && k !== 'reactivated'));
  const listParams = parseListParams(sp, { sortable: [], pageSize: PAGE_SIZE });

  const all = await listStaff(ctx);
  const fn = pick(sp.fn);
  const etat = STATES.find((s) => s === pick(sp.etat));
  const terms = fold(listParams.q).split(/\s+/).filter(Boolean);

  // Compteurs de fonctions et d'états : calculés dans la sélection en cours pour que les deux
  // filtres se recoupent sans se contredire.
  const matchesQ = (r: StaffRow) => terms.every((t) => haystack(r).includes(t));
  const matchesFn = (r: StaffRow) => !fn || r.functions.some((f) => f.code === fn);
  const matchesState = (r: StaffRow) => !etat || r.state === etat;
  const rows = all.filter((r) => matchesQ(r) && matchesFn(r) && matchesState(r));
  const byState = (s: StaffState) => all.filter((r) => matchesQ(r) && matchesFn(r) && r.state === s).length;
  const byFunction = (code: string) => all.filter((r) => matchesQ(r) && matchesState(r) && r.functions.some((f) => f.code === code)).length;

  const pages = pageCount(rows.length, PAGE_SIZE);
  if (listParams.page > pages) redirect(`${base}${mergeQuery(nav, { page: pages })}`);
  const pageRows = rows.slice(listParams.from, listParams.to + 1);

  const canCreate = hasPermission(ctx, 'users.create') && hasPermission(ctx, 'users.assign_roles');
  const canDisable = hasPermission(ctx, 'access_accounts.disable');
  const canReactivate = hasPermission(ctx, 'access_accounts.reactivate');
  const flash = sp.suspended === '1' ? 'Accès suspendu.' : sp.reactivated === '1' ? 'Accès réactivé.' : null;

  const stateHref = (s: StaffState | undefined) => `${base}${mergeQuery(nav, { etat: s ?? null, page: null })}`;
  const fnHref = (code: string | undefined) => `${base}${mergeQuery(nav, { fn: code ?? null, page: null })}`;
  const present = STAFF_FUNCTIONS.filter((code) => all.some((r) => r.functions.some((f) => f.code === code)));

  const columns: Column<StaffRow>[] = [
    {
      key: 'name',
      header: 'Personnel',
      render: (r) => (
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-brand-muted)] text-xs font-semibold text-[color:var(--color-brand)]"
          >
            {(`${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`.toUpperCase() || (r.name[0] ?? '?').toUpperCase())}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{r.name}</span>
            <span className="block text-xs font-normal text-[color:var(--muted-foreground)]">
              Matricule : {r.staffNumber ?? 'en cours'}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'functions',
      header: 'Fonction(s)',
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.functions.map((f) => (
            <span key={f.code} className="rounded-full border px-2 py-0.5 text-xs">
              {f.label}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <span className="block text-xs">
          <span className="block font-mono">{r.identifierDisplay ?? '—'}</span>
          {r.email && r.email !== r.identifier ? (
            <span className="block text-[color:var(--muted-foreground)]">{r.email}</span>
          ) : null}
        </span>
      ),
    },
    { key: 'state', header: 'État', render: (r) => <span className={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => {
        if (r.isFounder || r.userId === ctx.user.id) return null;
        return r.state === 'SUSPENDED' ? (
          canReactivate ? <SimpleSubmit action={reactivateStaffAction.bind(null, slug, r.userId)} label="Réactiver" small /> : null
        ) : canDisable ? (
          <ConfirmSubmit
            action={suspendStaffAction.bind(null, slug, r.userId)}
            label="Suspendre"
            variant="secondary"
            confirmMessage={`Suspendre l’accès de ${r.name} ? La personne ne pourra plus se connecter jusqu’à réactivation.`}
          />
        ) : null;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <PageHeader
        title="Personnel"
        description="Comptes et fonctions du personnel administratif. Les enseignants se gèrent dans Enseignants."
        action={
          <div className="flex items-center gap-3">
            <BackToSettings ctx={ctx} />
            {<div className="flex flex-wrap justify-end gap-2">
            <Link href={`/e/${slug}/import?type=staff`}>
              <Button variant="secondary">Importer / exporter</Button>
            </Link>
            {canCreate ? (
              <Link href={`${base}/new`}>
                <Button>Ajouter un membre du personnel</Button>
              </Link>
            ) : null}
            </div>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterTile
          href={stateHref(undefined)}
          label="Personnel"
          value={all.filter((r) => matchesQ(r) && matchesFn(r)).length}
          active={!etat}
        />
        {STATES.map((s) => (
          <FilterTile key={s} href={stateHref(s)} label={s === 'ACTIVE' ? 'Comptes actifs' : STATE_LABEL[s]} value={byState(s)} active={etat === s} />
        ))}
      </div>

      {present.length > 1 || fn ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill href={fnHref(undefined)} label="Toutes les fonctions" value={all.filter((r) => matchesQ(r) && matchesState(r)).length} active={!fn} />
          {present.map((code) => (
            <FilterPill key={code} href={fnHref(code)} label={roleLabel(code as RoleCode)} value={byFunction(code)} active={fn === code} />
          ))}
        </div>
      ) : null}

      <SearchBar
        basePath={base}
        defaultValue={listParams.q}
        placeholder="Nom, téléphone, matricule ou fonction…"
        hidden={{ ...(fn ? { fn } : {}), ...(etat ? { etat } : {}) }}
      />

      <DataTable
        columns={columns}
        rows={pageRows}
        total={rows.length}
        params={listParams}
        basePath={base}
        searchParams={nav}
        rowHref={(r) => `${base}/${r.userId}`}
        emptyLabel={all.length === 0 ? 'Aucun membre du personnel.' : 'Aucune personne ne correspond à ces filtres.'}
      />
    </div>
  );
}
