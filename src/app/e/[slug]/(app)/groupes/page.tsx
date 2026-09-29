import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listGroups } from '@/features/groups/service';
import { groupKindLabel } from '@/features/groups/kinds';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Groupes d’élèves' };

/**
 * Les groupes de l'année : LV2, options, demi-groupes, soutien.
 *
 * Un groupe rassemble des élèves de plusieurs classes pour un enseignement que
 * toute la classe ne suit pas. L'emploi du temps sait lui faire cours à part.
 */
export default async function GroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'groups.view');
  const base = `/e/${slug}/groupes`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Groupes d’élèves" />
        <EmptyState
          title="Aucune année active"
          hint="Activez une année scolaire d'abord."
          action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }}
        />
      </div>
    );
  }

  const groups = await listGroups(ctx, ctx.academicYear.id);
  const canCreate = hasPermission(ctx, 'groups.create');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash searchParams={sp} />
      {sp.supprime === '1' ? <Alert tone="success">Groupe supprimé.</Alert> : null}

      <PageHeader
        title="Groupes d’élèves"
        description={`Année ${ctx.academicYear.name}`}
        action={canCreate ? <Link href={`${base}/new`}><Button>Nouveau groupe</Button></Link> : null}
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Aucun groupe"
          hint="Un groupe sert quand une partie de la classe seulement suit un enseignement : la LV2, une option, un demi-groupe de travaux pratiques."
          {...(canCreate ? { action: { href: `${base}/new`, label: 'Créer un groupe' } } : {})}
        />
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`${base}/${g.id}`}>
                <Card className="transition hover:border-[color:var(--color-brand)]">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {g.name} <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{g.code}</span>
                      </p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {groupKindLabel(g.kind)}
                        {g.subject_name ? ` · ${g.subject_name}` : ''}
                        {g.classes.length > 0 ? ` · ${g.classes.map((c) => c.name).join(', ')}` : ' · aucune classe'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {g.members} élève{g.members > 1 ? 's' : ''}
                      {g.max_size ? <span className="text-[color:var(--muted-foreground)]"> / {g.max_size}</span> : null}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
