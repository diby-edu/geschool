import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { mergeQuery, pageCount, parseListParams } from '@/lib/query/list';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { AUDIT_MODULES, listAudit, type AuditFilter, type AuditRow } from '@/features/audit/queries';
import { cleanHidden, parseWho, readJournalPrefs } from '@/features/audit/journal-prefs';
import { saveJournalPrefsAction } from '@/features/audit/actions';
import { hasPermission } from '@/lib/permissions';
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
  const listParams = parseListParams(sp, { sortable: [], pageSize: PAGE_SIZE });

  // Filtre envoyé (f=1) : les cases cochées. Sinon : l'affichage mémorisé pour l'école.
  const saved = await readJournalPrefs(ctx);
  const submitted = sp.f === '1';
  const shownParam = sp.d === undefined ? [] : Array.isArray(sp.d) ? sp.d : [sp.d];
  const filter: AuditFilter = submitted
    ? { hidden: cleanHidden(AUDIT_MODULES.filter((m) => !shownParam.includes(m))), who: parseWho(sp.who) }
    : saved;
  const hidden = new Set(filter.hidden);
  const canSave = hasPermission(ctx, 'settings.update');
  const domains = [...AUDIT_MODULES].sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'fr'));

  const { rows, total } = await listAudit(ctx, filter, listParams);
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

      <form method="get" className="space-y-4 rounded-3xl border p-5" style={{ backgroundColor: 'var(--surface)' }}>
        <input type="hidden" name="f" value="1" />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Actions de</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ['all', 'Tout le monde'],
                ['teachers', 'Enseignants'],
                ['staff', 'Personnel (hors enseignants)'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="who" value={value} defaultChecked={filter.who === value} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Domaines affichés</legend>
          <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {domains.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="checkbox" name="d" value={m} defaultChecked={!hidden.has(m)} />
                {moduleLabel(m)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
            Décocher un domaine le masque seulement : toutes les actions restent enregistrées.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm">
            Afficher
          </Button>
          {canSave ? (
            <Button type="submit" size="sm" formAction={saveJournalPrefsAction.bind(null, slug)}>
              Enregistrer comme affichage par défaut
            </Button>
          ) : null}
          <Link href={`${base}?f=1${AUDIT_MODULES.map((m) => `&d=${m}`).join('')}`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Tout afficher
          </Link>
          {sp.saved === '1' ? <span className="text-sm text-[color:var(--color-success)]">Affichage par défaut enregistré.</span> : null}
        </div>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        emptyLabel={hidden.size > 0 || filter.who !== 'all' ? 'Aucun événement pour ce filtre.' : 'Aucun événement enregistré.'}
      />
    </div>
  );
}
