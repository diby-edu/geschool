import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { listMyBulletins } from '@/features/bulletins/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Mes bulletins' };

/**
 * Portail élève / famille. Aucune permission requise : la RLS (0023) ne renvoie
 * que les bulletins PUBLIÉS des élèves que l'utilisateur a le droit de voir
 * (ses enfants, ou lui-même). Accessible aussi au personnel, qui y voit les
 * bulletins publiés de son périmètre.
 */
export default async function MesBulletinsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const base = `/e/${slug}/mes-bulletins`;

  const bulletins = await listMyBulletins(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Mes bulletins" description={ctx.school.name} />

      {bulletins.length === 0 ? (
        <EmptyState title="Aucun bulletin publié" hint="Vos bulletins apparaîtront ici dès leur publication." />
      ) : (
        <ul className="space-y-2">
          {bulletins.map((b) => (
            <li key={b.id}>
              <Link href={`${base}/${b.id}`} className="block rounded-[--radius-card] border p-4 hover:bg-[color:var(--muted)]/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{b.student} · {b.period}</div>
                    <div className="text-xs text-[color:var(--muted-foreground)]">{b.klass}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">{b.average != null ? b.average.toFixed(2) : '—'}</div>
                    <div className="text-xs text-[color:var(--muted-foreground)]">Rang {b.rank ?? '—'}</div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
