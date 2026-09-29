import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery, pageCount, parseListParams } from '@/lib/query/list';
import { cn } from '@/lib/utils';
import {
  getOverview,
  listAccounts,
  KIND_FILTERS,
  STATUS_FILTERS,
  type AccessRow,
  type KindFilter,
  type StatusFilter,
} from '@/features/access/queries';
import { sendAction, resetAction, bulkSendAction, suspendAction, reactivateAction, resendAction } from '@/features/access/actions';
import { FilterPill, FilterTile } from '@/components/ui/filters';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Gestion des accès' };

const KIND: Record<string, string> = { STUDENT: 'Élève', GUARDIAN: 'Parent', TEACHER: 'Enseignant', STAFF: 'Personnel' };
const KIND_PLURAL: Record<KindFilter, string> = { TEACHER: 'Enseignants', GUARDIAN: 'Parents', STAFF: 'Personnel' };
const STATUS_LABEL: Record<'ALL' | StatusFilter, string> = {
  ALL: 'Tous les accès',
  NOT_ACTIVATED: 'Non activés',
  ACTIVATED: 'Activés',
  SUSPENDED: 'Suspendus',
};
/** Les accès de la direction ne se suspendent pas d'ici (cf. services/access-status.ts). */
const SUSPENDABLE = new Set(['TEACHER', 'GUARDIAN', 'STUDENT']);
/** Confirmations affichées une fois : elles ne doivent pas suivre la pagination. */
const FLASH_KEYS = ['sent', 'reset', 'bulk', 'suspended', 'reactivated', 'resent'];
const PAGE_SIZE = 25;

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'access_accounts.view');

  const base = `/e/${slug}/access`;
  // Liens de navigation : les confirmations d'action (?sent=1…) n'en font pas partie.
  const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => !FLASH_KEYS.includes(k)));

  const kind = KIND_FILTERS.find((k) => k === pick(sp.kind));
  const status = STATUS_FILTERS.find((s) => s === pick(sp.status));
  const listParams = parseListParams(sp, { sortable: [], pageSize: PAGE_SIZE });
  const filters = { kind, status, q: listParams.q };

  const [overview, { rows, total }] = await Promise.all([
    getOverview(ctx, { kind, status }),
    listAccounts(ctx, filters, listParams),
  ]);

  // Le total a pu baisser pendant la consultation (un acces vient d'etre active) :
  // on ramene a la derniere page existante plutot que d'afficher une page vide.
  const pages = pageCount(total, listParams.pageSize);
  if (listParams.page > pages) redirect(`${base}${mergeQuery(nav, { page: pages })}`);

  const canSend = hasPermission(ctx, 'access_accounts.send');
  const canReset = hasPermission(ctx, 'access_accounts.reset');
  const canBulk = hasPermission(ctx, 'access_accounts.bulk_send');
  const canResend = hasPermission(ctx, 'access_accounts.resend');
  const canDisable = hasPermission(ctx, 'access_accounts.disable');
  const canReactivate = hasPermission(ctx, 'access_accounts.reactivate');
  const hasActions = canSend || canReset || canResend || canDisable || canReactivate;

  const flash =
    sp.sent === '1'
      ? 'Identifiants envoyés.'
      : sp.reset === '1'
        ? 'Accès réinitialisé et envoyé.'
        : sp.bulk === '1'
          ? 'Envoi groupé traité.'
          : sp.suspended === '1'
            ? 'Accès suspendu : la personne ne peut plus se connecter.'
            : sp.reactivated === '1'
              ? 'Accès réactivé.'
              : sp.resent === '1'
                ? 'Identifiants renvoyés : un nouveau mot de passe temporaire a été envoyé.'
                : null;

  const statusHref = (s: StatusFilter | undefined) => `${base}${mergeQuery(nav, { status: s ?? null, page: null })}`;
  const kindHref = (k: KindFilter | undefined) => `${base}${mergeQuery(nav, { kind: k ?? null, page: null })}`;
  const filtered = Boolean(kind || status || listParams.q);

  const columns: Column<AccessRow>[] = [
    { key: 'name', header: 'Compte', render: (a) => <span className="font-medium">{a.name}</span> },
    { key: 'kind', header: 'Type', render: (a) => KIND[a.subject_kind] ?? a.subject_kind },
    { key: 'login', header: 'Identifiant', render: (a) => <span className="font-mono text-xs">{a.login_identifier}</span> },
    {
      key: 'activation',
      header: 'Activation',
      render: (a) =>
        a.account_status === 'SUSPENDED' ? (
          <span className="font-medium text-[color:var(--color-danger,#c0392b)]">Suspendu</span>
        ) : a.activation_status === 'ACTIVATED' ? (
          <span className="text-[color:var(--color-success)]">Activé</span>
        ) : (
          <span className="text-[color:var(--muted-foreground)]">Non activé</span>
        ),
    },
    ...(hasActions
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (a: AccessRow) => (
              <div className="flex justify-end gap-2">
                {canSend && a.has_pending && a.account_status !== 'SUSPENDED' ? (
                  <SimpleSubmit action={sendAction.bind(null, slug, a.user_id)} label="Envoyer" small />
                ) : null}
                {canReset && a.activation_status === 'ACTIVATED' && a.account_status !== 'SUSPENDED' ? (
                  <ConfirmSubmit
                    action={resetAction.bind(null, slug, a.user_id)}
                    label="Réinitialiser"
                    variant="secondary"
                    confirmMessage={`Réinitialiser l'accès de ${a.name} ? Un nouveau mot de passe temporaire lui sera envoyé.`}
                  />
                ) : null}
                {canResend &&
                SUSPENDABLE.has(a.subject_kind) &&
                a.activation_status !== 'ACTIVATED' &&
                !a.has_pending &&
                a.account_status !== 'SUSPENDED' ? (
                  <ConfirmSubmit
                    action={resendAction.bind(null, slug, a.user_id)}
                    label="Renvoyer"
                    variant="secondary"
                    confirmMessage={`Renvoyer les identifiants à ${a.name} ? Un nouveau mot de passe temporaire lui sera envoyé et l'ancien ne fonctionnera plus.`}
                  />
                ) : null}
                {SUSPENDABLE.has(a.subject_kind) && a.account_status === 'SUSPENDED' && canReactivate ? (
                  <SimpleSubmit action={reactivateAction.bind(null, slug, a.user_id)} label="Réactiver" small />
                ) : null}
                {SUSPENDABLE.has(a.subject_kind) && a.account_status !== 'SUSPENDED' && canDisable ? (
                  <ConfirmSubmit
                    action={suspendAction.bind(null, slug, a.user_id)}
                    label="Suspendre"
                    variant="secondary"
                    confirmMessage={`Suspendre l'accès de ${a.name} ? La personne ne pourra plus se connecter (dans tous ses espaces : enseignant, parent) jusqu'à réactivation.`}
                  />
                ) : null}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <PageHeader
        title="Gestion des accès"
        description={`Comptes, activation et transmission des identifiants. Code école à communiquer : ${ctx.school.loginCode}.`}
        action={
          <div className="flex items-center gap-3">
            <BackToSettings ctx={ctx} />
            {canBulk && overview.sms.pending > 0 ? (
            <SimpleSubmit action={bulkSendAction.bind(null, slug)} label={`Envoyer les ${overview.sms.pending} en attente`} />
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterTile href={statusHref(undefined)} label={STATUS_LABEL.ALL} value={overview.byStatus.ALL} active={!status} />
        {STATUS_FILTERS.map((s) => (
          <FilterTile key={s} href={statusHref(s)} label={STATUS_LABEL[s]} value={overview.byStatus[s]} active={status === s} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill href={kindHref(undefined)} label="Tous les types" value={overview.byKind.ALL} active={!kind} />
        {KIND_FILTERS.map((k) => (
          <FilterPill key={k} href={kindHref(k)} label={KIND_PLURAL[k]} value={overview.byKind[k]} active={kind === k} />
        ))}
        <p className="ml-auto text-xs text-[color:var(--muted-foreground)]">
          SMS : <span className="tabular-nums">{overview.sms.pending}</span> en attente ·{' '}
          <span className="tabular-nums">{overview.sms.sent}</span> envoyés ·{' '}
          <span className={cn('tabular-nums', overview.sms.failed > 0 && 'font-medium text-[color:var(--color-danger,#c0392b)]')}>
            {overview.sms.failed}
          </span>{' '}
          en échec
        </p>
      </div>

      <SearchBar
        basePath={base}
        defaultValue={listParams.q}
        placeholder="Nom, téléphone ou e-mail…"
        hidden={{ ...(kind ? { kind } : {}), ...(status ? { status } : {}) }}
      />

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={nav}
        emptyLabel={filtered ? 'Aucun accès ne correspond à ces filtres.' : 'Aucun accès.'}
      />
    </div>
  );
}
