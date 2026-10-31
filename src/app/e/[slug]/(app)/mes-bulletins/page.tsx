import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { listMyBulletins } from '@/features/bulletins/queries';
import { myChildren, parentPortal, pickChild } from '@/features/family/children';
import { ParentChrome } from '@/features/family/components/ParentChrome';
import { unreadCount } from '@/features/communication/inbox';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Bulletins' };

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Bulletins (maquette espace-parent v3, onglet 3). Le document officiel, tel
 * que l'administration l'a publié après le conseil de classe : rien n'y est
 * recalculé. La RLS (0023) ne renvoie que les bulletins PUBLIÉS des élèves que
 * l'on peut suivre — pour un parent, ses enfants débloqués (0172).
 *
 * Un compte sans enfant (élève, personnel) garde la liste simple d'avant.
 */
export default async function MesBulletinsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requireFeature(ctx, 'parent_portal');
  const base = `/e/${slug}/mes-bulletins`;
  const isParent = (ctx.membership?.roles ?? []).includes('PARENT');

  const [children, portal, unread] = isParent ? await Promise.all([myChildren(ctx), parentPortal(ctx), unreadCount(ctx)]) : [[], { price: 0 }, 0];
  const child = pickChild(children, premier(sp.enfant));

  if (isParent && child && !child.unlocked) {
    return (
      <ParentChrome slug={slug} kids={children} current={child} path="mes-bulletins" price={portal.price} unread={unread}>
        {null}
      </ParentChrome>
    );
  }

  const bulletins = await listMyBulletins(ctx, { childrenOnly: isParent, ...(child ? { studentId: child.id } : {}) });

  const content = (
    <>
      <PageHeader title="Bulletins" description={child ? `${child.name}${child.className ? ` · ${child.className}` : ''}` : ctx.school.name} />
      {bulletins.length === 0 ? (
        <EmptyState
          title="Aucun bulletin publié"
          hint="Le bulletin apparaîtra ici après le conseil de classe, quand l’administration l’aura publié."
        />
      ) : (
        <ul className="space-y-2">
          {bulletins.map((b) => (
            <li key={b.id}>
              <Link href={`${base}/${b.id}`} className="block rounded-[--radius-card] border p-4 hover:bg-[color:var(--muted)]/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      📄 {child ? b.period : `${b.student} · ${b.period}`}
                    </div>
                    <div className="text-xs text-[color:var(--muted-foreground)]">
                      {b.klass}
                      {b.publishedAt ? ` · publié le ${new Date(b.publishedAt).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">{b.average != null ? b.average.toFixed(2).replace('.', ',') : '—'}</div>
                    <div className="text-xs text-[color:var(--muted-foreground)]">Rang {b.rank ?? '—'}</div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return isParent ? (
    <ParentChrome slug={slug} kids={children} current={child} path="mes-bulletins" price={portal.price} unread={unread}>
      {content}
    </ParentChrome>
  ) : (
    <div className="mx-auto max-w-2xl space-y-6">{content}</div>
  );
}
