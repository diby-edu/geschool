import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery, pageCount, parseListParams } from '@/lib/query/list';
import {
  getOverview,
  listAccounts,
  KIND_FILTERS,
  STATUS_FILTERS,
  type AccessRow,
  type KindFilter,
  type StatusFilter,
} from '@/features/access/queries';
import { sendAction, resetAction, bulkSendAction, suspendAction, reactivateAction, resendAction, unlockAction, changeLoginAction, signOutEverywhereAction } from '@/features/access/actions';
import { ChangeLoginForm } from '@/features/access/components/ChangeLoginForm';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { FilterTile } from '@/components/ui/filters';
import { ListFilters } from '@/components/data-table/ListFilters';
import { ActionMenu } from '@/components/ui/more-menu';
import { CopyButton } from '@/components/ui/copy-button';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Gestion des accès' };

const KIND: Record<string, string> = { STUDENT: 'Élève', GUARDIAN: 'Parent', TEACHER: 'Enseignant', STAFF: 'Personnel' };
const KIND_PLURAL: Record<KindFilter, string> = { TEACHER: 'Enseignants', GUARDIAN: 'Parents', STAFF: 'Personnel' };
// Libellés en clair (maquette validée le 2026-10-30) : « activé » ne parlait à personne.
const STATUS_LABEL: Record<'ALL' | StatusFilter, string> = {
  ALL: 'Personnes avec un accès',
  NOT_ACTIVATED: 'Jamais connectées',
  ACTIVATED: 'Déjà connectées',
  SUSPENDED: 'Accès coupés',
};
const CHANNEL: Record<string, string> = { SMS: 'SMS', WHATSAPP: 'WhatsApp', EMAIL: 'e-mail', PRINT: 'papier' };
const DELIVERY: Record<string, string> = {
  PENDING: 'en attente',
  PROCESSING: 'en cours d’envoi',
  SENT: 'envoyé',
  DELIVERED: 'bien reçu',
  FAILED: 'non arrivé',
  CANCELLED: 'annulé',
};
const soft = (v: string) => `color-mix(in srgb, ${v} 14%, transparent)`;
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: soft(color), color }}>
      {children}
    </span>
  );
}
/** Les accès de la direction ne se suspendent pas d'ici (cf. services/access-status.ts). */
const SUSPENDABLE = new Set(['TEACHER', 'GUARDIAN', 'STUDENT']);
/** Confirmations affichées une fois : elles ne doivent pas suivre la pagination. */
const FLASH_KEYS = ['sent', 'reset', 'bulk', 'suspended', 'reactivated', 'resent', 'unlocked', 'login_changed', 'signed_out'];
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

  const [overview, { rows, total, locked }] = await Promise.all([
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
  const canUnlock = hasPermission(ctx, 'access_accounts.unlock');
  const canChangeLogin = hasPermission(ctx, 'access_accounts.change_login');
  const canSignOut = hasPermission(ctx, 'access_accounts.sign_out');
  const hasActions = canSend || canReset || canResend || canDisable || canReactivate || canUnlock || canChangeLogin || canSignOut;

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
                : sp.unlocked === '1'
                  ? 'Compte débloqué : la personne peut réessayer tout de suite.'
                  : sp.login_changed === '1'
                    ? 'Identifiant corrigé : la personne se connecte maintenant avec le nouveau, avec le même mot de passe.'
                    : sp.signed_out === '1'
                      ? 'Déconnecté de tous ses appareils : la personne devra se reconnecter avec son mot de passe.'
                      : null;

  const statusHref = (s: StatusFilter | undefined) => `${base}${mergeQuery(nav, { status: s ?? null, page: null })}`;
  const filtered = Boolean(kind || status || listParams.q);

  const showLogin = (id: string) => (id.startsWith('+') ? formatPhoneForDisplay(id, ctx.school.countryCode) : id);

  const actionsFor = (a: AccessRow) => {
    const items: React.ReactNode[] = [];
    if (canUnlock && locked.has(a.user_id)) items.push(<SimpleSubmit key="u" action={unlockAction.bind(null, slug, a.user_id)} label="Débloquer le compte" small />);
    if (canSend && a.has_pending && a.account_status !== 'SUSPENDED') items.push(<SimpleSubmit key="s" action={sendAction.bind(null, slug, a.user_id)} label="Envoyer les identifiants" small />);
    if (canResend && SUSPENDABLE.has(a.subject_kind) && a.activation_status !== 'ACTIVATED' && !a.has_pending && a.account_status !== 'SUSPENDED')
      items.push(
        <ConfirmSubmit
          key="rs"
          action={resendAction.bind(null, slug, a.user_id)}
          label="Renvoyer les identifiants"
          variant="secondary"
          confirmMessage={`Renvoyer les identifiants à ${a.name} ? Un nouveau mot de passe temporaire lui sera envoyé et l'ancien ne fonctionnera plus.`}
        />,
      );
    if (canReset && a.activation_status === 'ACTIVATED' && a.account_status !== 'SUSPENDED')
      items.push(
        <ConfirmSubmit
          key="r"
          action={resetAction.bind(null, slug, a.user_id)}
          label="Réinitialiser le mot de passe"
          variant="secondary"
          confirmMessage={`Réinitialiser l'accès de ${a.name} ? Un nouveau mot de passe temporaire lui sera envoyé.`}
        />,
      );
    if (canChangeLogin && a.user_id !== ctx.user.id && !a.login_identifier.match(/^[A-Z0-9]+$/))
      items.push(
        <ChangeLoginForm
          key="cl"
          action={changeLoginAction.bind(null, slug, a.user_id)}
          current={showLogin(a.login_identifier)}
          byPhone={a.login_identifier.startsWith('+')}
          small
        />,
      );
    if (canSignOut && a.user_id !== ctx.user.id && a.activation_status === 'ACTIVATED')
      items.push(
        <ConfirmSubmit
          key="so"
          action={signOutEverywhereAction.bind(null, slug, a.user_id)}
          label="Déconnecter de partout"
          variant="secondary"
          confirmMessage={`Déconnecter ${a.name} de tous ses appareils ? Il devra se reconnecter avec son mot de passe.`}
        />,
      );
    if (SUSPENDABLE.has(a.subject_kind) && a.account_status === 'SUSPENDED' && canReactivate)
      items.push(<SimpleSubmit key="ra" action={reactivateAction.bind(null, slug, a.user_id)} label="Rétablir l’accès" small />);
    if (SUSPENDABLE.has(a.subject_kind) && a.account_status !== 'SUSPENDED' && canDisable)
      items.push(
        <ConfirmSubmit
          key="su"
          action={suspendAction.bind(null, slug, a.user_id)}
          label="Couper l’accès"
          variant="secondary"
          confirmMessage={`Couper l'accès de ${a.name} ? La personne ne pourra plus se connecter (dans tous ses espaces : enseignant, parent) jusqu'à ce que vous le rétablissiez.`}
        />,
      );
    return items;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <PageHeader
        title="Gestion des accès"
        description={`Qui peut se connecter à l’application, et avec quel identifiant. Code école à communiquer : ${ctx.school.loginCode}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canBulk && overview.sms.pending > 0 ? (
              <SimpleSubmit action={bulkSendAction.bind(null, slug)} label={`Envoyer les ${overview.sms.pending} identifiants en attente`} />
            ) : null}
            {hasPermission(ctx, 'access_accounts.view_history') ? (
              <Link href={`/e/${slug}/access/historique`} className="rounded-[--radius-card] border px-3.5 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                Historique
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--color-brand) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-brand) 7%, var(--surface))' }}>
        <b style={{ color: 'var(--color-brand)' }}>À quoi sert cette page ?</b> Chaque enseignant, parent et membre du personnel reçoit par SMS (ou par
        e-mail) un <b>identifiant</b> et un <b>mot de passe</b> pour se connecter à l’application. Ici, vous voyez qui a déjà utilisé son accès, et vous
        pouvez renvoyer ses identifiants s’il les a perdus, changer son mot de passe, ou lui couper l’accès.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <FilterTile href={statusHref(undefined)} label={STATUS_LABEL.ALL} value={overview.byStatus.ALL} active={!status} />
        {STATUS_FILTERS.map((st) => (
          <FilterTile key={st} href={statusHref(st)} label={STATUS_LABEL[st]} value={overview.byStatus[st]} active={status === st} />
        ))}
        <FilterTile label="SMS d’identifiants non arrivés" value={overview.sms.failed} />
      </div>

      <ListFilters
        basePath={base}
        fields={[
          {
            name: 'kind',
            label: 'Personnes',
            allLabel: `Tout le monde (${overview.byKind.ALL})`,
            value: kind ?? '',
            options: KIND_FILTERS.map((k) => ({ value: k, label: `${KIND_PLURAL[k]} (${overview.byKind[k]})` })),
          },
          {
            name: 'status',
            label: 'État de l’accès',
            allLabel: 'Tous',
            value: status ?? '',
            options: STATUS_FILTERS.map((st) => ({ value: st, label: STATUS_LABEL[st] })),
          },
        ]}
        search={{ value: listParams.q, placeholder: 'Nom, téléphone ou e-mail…' }}
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border px-4 py-6 text-center text-sm text-[color:var(--muted-foreground)]" style={{ borderColor: 'var(--border)' }}>
          {filtered ? 'Aucun accès ne correspond à ces filtres.' : 'Aucun accès.'}
        </p>
      ) : (
        <>
          {/* Pas de défilement horizontal sur grand écran : le menu « Actions » doit pouvoir déborder du tableau. */}
          <div className="overflow-x-auto rounded-2xl border pb-1 md:overflow-visible" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)' }}>
                  <th className="px-4 py-2.5">Personne</th>
                  <th className="px-4 py-2.5">Se connecte avec</th>
                  <th className="px-4 py-2.5">État de l’accès</th>
                  <th className="px-4 py-2.5">Identifiants envoyés</th>
                  {hasActions ? <th className="px-4 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const login = showLogin(a.login_identifier);
                  const actions = hasActions ? actionsFor(a) : [];
                  const d = a.last_delivery;
                  return (
                    <tr key={a.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-2.5">
                        <b className="whitespace-nowrap">{a.name}</b>
                        <span className="block text-xs text-[color:var(--muted-foreground)]">{KIND[a.subject_kind] ?? a.subject_kind}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="font-mono text-xs">{login}</span>
                        <CopyButton value={login} label="Copier l’identifiant" />
                      </td>
                      <td className="px-4 py-2.5">
                        {locked.has(a.user_id) && a.account_status !== 'SUSPENDED' ? (
                          <Pill color="var(--color-danger)">Bloqué : 5 mots de passe faux</Pill>
                        ) : a.account_status === 'SUSPENDED' ? (
                          <Pill color="var(--color-danger)">Accès coupé</Pill>
                        ) : a.activation_status === 'ACTIVATED' ? (
                          <Pill color="var(--color-success)">Actif, déjà connecté</Pill>
                        ) : (
                          <Pill color="var(--muted-foreground)">Jamais connecté</Pill>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[color:var(--muted-foreground)]">
                        {d ? (
                          <>
                            le {new Date(d.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} par {CHANNEL[d.channel] ?? d.channel}{' '}
                            <span style={d.status === 'FAILED' ? { color: 'var(--color-danger)', fontWeight: 700 } : undefined}>({DELIVERY[d.status] ?? d.status})</span>
                          </>
                        ) : (
                          'jamais envoyés'
                        )}
                      </td>
                      {hasActions ? (
                        <td className="px-4 py-2.5 text-right">{actions.length > 0 ? <ActionMenu>{actions}</ActionMenu> : null}</td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav className="flex items-center justify-between px-1" aria-label="Pages">
              <span className="text-xs text-[color:var(--muted-foreground)]">
                {listParams.from + 1} – {Math.min(listParams.to + 1, total)} sur {total}
              </span>
              <span className="flex items-center gap-2">
                {listParams.page > 1 ? (
                  <Link href={`${base}${mergeQuery(nav, { page: listParams.page - 1 === 1 ? null : listParams.page - 1 })}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                    ‹ Précédent
                  </Link>
                ) : null}
                <span className="text-xs text-[color:var(--muted-foreground)]">
                  Page {listParams.page} / {pages}
                </span>
                {listParams.page < pages ? (
                  <Link href={`${base}${mergeQuery(nav, { page: listParams.page + 1 })}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                    Suivant ›
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
