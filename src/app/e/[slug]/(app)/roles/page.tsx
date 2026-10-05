import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PERMISSION_GROUPS } from '@/lib/permissions/catalog';
import { cn } from '@/lib/utils';
import {
  allRolePermissions,
  getRolePermissionCodes,
  listExistingPermissionCodes,
  listSchoolRoles,
} from '@/features/roles/queries';
import { customizeRolesAction, resetRoleAction, saveRolePermissionsAction, togglePermissionAction } from '@/features/roles/actions';
import { RolePermissionsForm } from '@/features/roles/components/RolePermissionsForm';
import { PermissionMatrix } from '@/features/roles/components/PermissionMatrix';
import { CellToggle } from '@/features/roles/components/CellToggle';
import { hasPermission } from '@/lib/permissions';
import { roleShort, type RoleCode } from '@/lib/permissions/roles';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Rôles et droits' };

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'users.assign_roles');

  const roles = await listSchoolRoles(ctx);
  const flash =
    sp.customized === '1'
      ? 'Les fonctions de votre établissement sont prêtes : vous pouvez régler leurs droits.'
      : sp.saved === '1'
        ? 'Droits enregistrés : ils s’appliquent tout de suite aux personnes concernées.'
        : sp.reset === '1'
          ? 'Droits d’origine rétablis.'
          : null;

  // Établissement encore sur les modèles partagés : une étape, une seule fois.
  if (roles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader title="Rôles et droits" description="Réglez ce que chaque fonction du personnel peut faire." action={<BackToSettings ctx={ctx} />}
      />
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm">
              Votre établissement utilise pour l’instant les fonctions standard, communes à tous. Pour cocher et décocher
              leurs droits, il faut d’abord en créer une copie <b>propre à votre établissement</b> : les changements
              n’affecteront aucun autre établissement.
            </p>
            <SimpleSubmit action={customizeRolesAction.bind(null, slug)} label="Personnaliser les fonctions" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const vue = pick(sp.vue) === 'ensemble' ? 'ensemble' : 'fonction';
  const selected = roles.find((r) => r.code === pick(sp.role)) ?? roles.find((r) => !r.locked) ?? roles[0]!;
  const [existing, currentCodes, accordes] = await Promise.all([
    listExistingPermissionCodes(),
    selected.locked ? Promise.resolve<string[]>([]) : getRolePermissionCodes(ctx, selected.id),
    allRolePermissions(ctx),
  ]);
  const peutRegler = hasPermission(ctx, 'users.assign_roles') && ctx.school.status === 'ACTIVE';

  // Seuls les droits qui existent en base ET qui ont un effet réel sont proposés.
  const groups = PERMISSION_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => existing.has(i.code)) })).filter(
    (g) => g.items.length > 0,
  );
  const shown = new Set(groups.flatMap((g) => g.items.map((i) => i.code)));
  const initial = selected.locked ? [...shown] : currentCodes.filter((c) => shown.has(c));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <PageHeader
        title="Rôles et droits"
        description="Choisissez une fonction, cochez ce qu’elle peut faire. Chaque changement s’applique tout de suite à toutes les personnes qui l’exercent."
        action={<BackToSettings ctx={ctx} />}
      />

      <nav className="flex gap-1 border-b" aria-label="Vue">
        {[
          { id: 'fonction', label: 'Par fonction', href: `/e/${slug}/roles?role=${selected.code}` },
          { id: 'ensemble', label: 'Vue d’ensemble', href: `/e/${slug}/roles?vue=ensemble` },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            scroll={false}
            aria-current={vue === t.id ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              vue === t.id
                ? 'border-[color:var(--color-brand)] font-semibold text-[color:var(--color-brand)]'
                : 'border-transparent text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {vue === 'ensemble' ? (
        <PermissionMatrix
          groups={groups}
          roles={roles.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            short: roleShort(r.code as RoleCode),
            locked: r.locked,
          }))}
          granted={accordes}
          readOnly={!peutRegler}
          highlight={pick(sp.maj)}
          {...(peutRegler
            ? {
                toggle: (roleId: string, code: string, grant: boolean, label: string) => (
                  <CellToggle
                    action={togglePermissionAction.bind(null, slug, roleId, code, grant)}
                    granted={!grant}
                    label={label}
                  />
                ),
              }
            : {})}
        />
      ) : (
      <div className="grid gap-5 md:grid-cols-[15rem_1fr]">
        <nav aria-label="Fonctions" className="space-y-1 md:sticky md:top-4 md:self-start">
          {roles.map((r) => {
            const active = r.id === selected.id;
            return (
              <Link
                key={r.id}
                href={`/e/${slug}/roles?role=${r.code}`}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-[--radius-card] border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--color-brand-muted)]',
                  active && 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-muted)] font-medium',
                )}
              >
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-[color:var(--muted-foreground)]">
                  {r.locked ? 'complet' : r.members === null ? '' : r.members}
                </span>
              </Link>
            );
          })}
          <p className="px-1 pt-2 text-xs text-[color:var(--muted-foreground)]">
            Les droits des enseignants, parents et élèves ne se règlent pas ici : ils dépendent de leurs classes et de
            leurs enfants.
          </p>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-0.5 text-sm text-[color:var(--muted-foreground)]">{selected.description}</p>
                {selected.members !== null ? (
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    {selected.members === 0
                      ? 'Personne n’exerce encore cette fonction.'
                      : `${selected.members} personne${selected.members > 1 ? 's' : ''} exerce${selected.members > 1 ? 'nt' : ''} cette fonction.`}
                  </p>
                ) : null}
              </div>
              {selected.locked ? null : (
                <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/e/${slug}/dashboard?apercu=${selected.code}`}
                  className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-[color:var(--color-brand-muted)]"
                >
                  Voir son tableau de bord
                </Link>
                <ConfirmSubmit
                  action={resetRoleAction.bind(null, slug, selected.id)}
                  label="Rétablir les droits d’origine"
                  variant="secondary"
                  confirmMessage={`Rétablir les droits d’origine de la fonction « ${selected.name} » ? Vos réglages actuels seront remplacés.`}
                />
                </div>
              )}
            </CardContent>
          </Card>

          {selected.locked ? (
            <Alert tone="info">
              Le Fondateur a tous les droits, en permanence : ils ne se modifient pas et personne d’autre ne peut recevoir
              cette fonction. Pour partager des responsabilités, attribuez la fonction Directeur ou une autre.
            </Alert>
          ) : null}

          <RolePermissionsForm
            key={`${selected.id}:${sp.saved ?? ''}:${sp.reset ?? ''}`}
            action={saveRolePermissionsAction.bind(null, slug, selected.id)}
            groups={groups}
            initial={initial}
            locked={selected.locked}
          />
        </div>
      </div>
      )}
    </div>
  );
}
