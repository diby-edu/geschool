import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listClasses } from '@/features/classes/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Classes' };

export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.view');

  const base = `/e/${slug}/classes`;
  const canCreate = hasPermission(ctx, 'classes.create');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Classes" />
        <EmptyState
          title="Aucune annee scolaire active"
          hint="Activez une annee scolaire pour gerer les classes."
        />
      </div>
    );
  }

  const classes = await listClasses(ctx, ctx.academicYear.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Classes"
        description={`Annee ${ctx.academicYear.name}`}
        action={
          canCreate ? (
            <Link href={`${base}/new`}>
              <Button>Nouvelle classe</Button>
            </Link>
          ) : null
        }
      />

      {classes.length === 0 ? (
        <EmptyState title="Aucune classe" hint="Creez une classe a partir d'un niveau." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/${c.id}`}>
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{c.code}</span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      {c.level_name ?? '—'} · {c.enrolled}/{c.capacity || '∞'} eleves
                      {c.head_teacher ? ` · PP ${c.head_teacher}` : ''}
                    </p>
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
