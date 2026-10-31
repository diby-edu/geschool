import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { createClient } from '@/lib/supabase/server';
import { listClassFilterOptions } from '@/features/students/queries';
import { nextTier, readParentStats } from '@/features/billing/parent-portal';
import { ListFilters } from '@/components/data-table/ListFilters';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Espace Parent' };
export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const PAGE = 50;

/**
 * Espace Parent, côté école (maquette espace-parent v3, partie 4) : combien
 * d'élèves sont activés par leurs parents, la réduction que cela vaut sur le
 * prochain abonnement, et la liste par classe pour relancer les familles.
 * L'école ne paie rien et ne reçoit rien ; seuls les parents paient.
 */
export default async function SchoolParentPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['billing.view', 'students.view']);
  const base = `/e/${slug}/facturation/espace-parent`;

  const classe = premier(sp.classe);
  const etat = premier(sp.etat);
  const q = premier(sp.q).trim();
  const page = Math.max(1, Number(premier(sp.page)) || 1);

  const supabase = await createClient();
  const [stats, options, { data }] = await Promise.all([
    readParentStats(ctx),
    ctx.academicYear ? listClassFilterOptions(ctx, ctx.academicYear.id) : Promise.resolve({ levels: [], classes: [] }),
    supabase.rpc('school_parent_students' as never, {
      p_school: ctx.school.id,
      p_class: /^[0-9a-f-]{36}$/.test(classe) ? classe : null,
      p_state: etat === 'actives' || etat === 'non' ? etat : null,
      p_q: q || null,
      p_limit: PAGE,
      p_offset: (page - 1) * PAGE,
    } as never),
  ]);
  const list = (data ?? { total: 0, rows: [] }) as unknown as {
    total: number;
    rows: { id: string; name: string; matricule: string; className: string | null; paidAt: string | null; paidBy: string | null }[];
  };
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const next = stats ? nextTier(stats) : null;
  const pct = stats && stats.students > 0 ? Math.round((stats.activated * 100) / stats.students) : 0;
  const href = (n: number) => {
    const u = new URLSearchParams();
    if (classe) u.set('classe', classe);
    if (etat) u.set('etat', etat);
    if (q) u.set('q', q);
    if (n > 1) u.set('page', String(n));
    return `${base}${u.size ? `?${u}` : ''}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Espace Parent"
        description="Payé par les parents, par enfant. L’école ne paie rien ; plus de familles activées = une réduction sur son prochain abonnement."
        action={
          <Link href={`/e/${slug}/facturation`}>
            <Button variant="ghost">Retour à l’abonnement</Button>
          </Link>
        }
      />

      {stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { l: 'Élèves', v: stats.students.toLocaleString('fr-FR') },
            { l: 'Activés par les parents', v: `${stats.activated.toLocaleString('fr-FR')} (${pct} %)` },
            { l: 'Cette semaine', v: `+${stats.thisWeek.toLocaleString('fr-FR')}` },
            { l: 'Réduction atteinte', v: `${stats.discountPct} %` },
          ].map((t) => (
            <Card key={t.l}>
              <CardContent className="py-3">
                <p className="text-xs text-[color:var(--muted-foreground)]">{t.l}</p>
                <p className="text-xl font-extrabold">{t.v}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {stats ? (
        <p className="rounded-xl px-4 py-2.5 text-sm" style={{ background: 'color-mix(in srgb, #f2711b 10%, transparent)' }}>
          {stats.discountPct > 0 ? <b>Réduction atteinte : {stats.discountPct} % sur votre prochain abonnement. </b> : null}
          {next
            ? `Encore ${next.missing.toLocaleString('fr-FR')} élève${next.missing > 1 ? 's' : ''} pour atteindre ${next.minPct} % d’élèves activés et ${next.discountPct} % de réduction.`
            : stats.discountPct > 0
              ? 'Vous avez atteint le palier le plus haut.'
              : ''}
          {' '}Prix pour les parents : {stats.price.toLocaleString('fr-FR')} F par enfant et par an.
        </p>
      ) : null}

      <ListFilters
        basePath={base}
        fields={[
          { name: 'classe', label: 'Classe', allLabel: 'Toutes les classes', value: classe, options: options.classes.map((c) => ({ value: c.id, label: c.name })) },
          {
            name: 'etat',
            label: 'Espace Parent',
            allLabel: 'Tous',
            value: etat,
            options: [
              { value: 'actives', label: 'Activés' },
              { value: 'non', label: 'Non activés' },
            ],
          },
        ]}
        search={{ value: q, placeholder: 'Nom ou matricule' }}
      />

      {list.rows.length === 0 ? (
        <EmptyState title="Aucun élève" hint="Changez les filtres." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Élève</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Espace Parent</th>
                <th className="px-3 py-2">Payé par</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="block font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</span>
                  </td>
                  <td className="px-3 py-2">{r.className ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                      style={
                        r.paidAt
                          ? { background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }
                          : { background: 'var(--border)', color: 'var(--muted-foreground)' }
                      }
                    >
                      {r.paidAt ? 'Activé' : 'Non activé'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
                    {r.paidAt ? `${r.paidBy ?? 'Un parent'} · ${new Date(r.paidAt).toLocaleDateString('fr-FR')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--muted-foreground)]">
            {list.total.toLocaleString('fr-FR')} élève{list.total > 1 ? 's' : ''} · page {page} sur {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? <Link href={href(page - 1)} className="rounded-lg border px-3 py-1" style={{ borderColor: 'var(--border)' }}>← Précédente</Link> : null}
            {page < pages ? <Link href={href(page + 1)} className="rounded-lg border px-3 py-1" style={{ borderColor: 'var(--border)' }}>Suivante →</Link> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
