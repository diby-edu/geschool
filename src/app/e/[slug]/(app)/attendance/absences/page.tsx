import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { ABSENCES_PAGE_SIZE, listAbsences } from '@/features/attendance/queries';
import { listClassFilterOptions } from '@/features/students/queries';
import { ListFilters } from '@/components/data-table/ListFilters';
import { mergeQuery } from '@/lib/query/list';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Absences et retards' };

const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const SORTS = ['date', 'classe', 'eleve'] as const;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  // « Toutes les présences » inclut l'accès au module.
  requirePageAccessAny(ctx, ['attendance.view', 'attendance.view_all']);
  requireFeature(ctx, 'attendance');
  const base = `/e/${slug}/attendance`;

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600_000);
  const from = typeof sp.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : iso(monthAgo);
  const to = typeof sp.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : iso(today);
  const page = Math.max(1, Number(typeof sp.page === 'string' ? sp.page : '1') || 1);
  const sort = (SORTS as readonly string[]).includes(pick(sp.tri)) ? (pick(sp.tri) as (typeof SORTS)[number]) : 'date';
  const kind = pick(sp.type) === 'ABSENT' || pick(sp.type) === 'LATE' ? (pick(sp.type) as 'ABSENT' | 'LATE') : undefined;
  const [{ rows, total }, options] = await Promise.all([
    listAbsences(ctx, { from, to, page, level: pick(sp.niveau), classId: pick(sp.classe), kind, q: pick(sp.q), sort }),
    ctx.academicYear ? listClassFilterOptions(ctx, ctx.academicYear.id) : Promise.resolve({ levels: [], classes: [] }),
  ]);
  const pages = Math.max(1, Math.ceil(total / ABSENCES_PAGE_SIZE));
  const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => ['from', 'to', 'niveau', 'classe', 'type', 'q', 'tri', 'page'].includes(k)));
  const lienPage = (n: number) => `${base}/absences${mergeQuery(nav, { page: n === 1 ? null : n })}`;
  const sortHead = (key: (typeof SORTS)[number], label: string) => (
    <Link href={`${base}/absences${mergeQuery(nav, { tri: key === 'date' ? null : key, page: null })}`} scroll={false} className="inline-flex items-center gap-1 hover:underline">
      {label}
      <span aria-hidden style={{ opacity: sort === key ? 1 : 0.35, color: sort === key ? 'var(--color-brand)' : undefined }}>
        {sort === key ? (key === 'date' ? '↓' : '↑') : '↕'}
      </span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Absences et retards"
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      <ListFilters
        basePath={`${base}/absences`}
        keep={{ tri: pick(sp.tri) }}
        fields={[
          { name: 'from', label: 'Du', allLabel: '', value: from, options: [], type: 'date' },
          { name: 'to', label: 'Au', allLabel: '', value: to, options: [], type: 'date' },
          { name: 'niveau', label: 'Niveau', allLabel: 'Tous les niveaux', value: pick(sp.niveau), options: options.levels.map((l) => ({ value: l.id, label: l.name })) },
          { name: 'classe', label: 'Classe', allLabel: 'Toutes les classes', value: pick(sp.classe), dependsOn: 'niveau', options: options.classes.map((c) => ({ value: c.id, label: c.name, parent: c.levelId })) },
          {
            name: 'type',
            label: 'Type',
            allLabel: 'Absences et retards',
            value: kind ?? '',
            options: [
              { value: 'ABSENT', label: 'Absences seulement' },
              { value: 'LATE', label: 'Retards seulement' },
            ],
          },
        ]}
        search={{ value: pick(sp.q), placeholder: 'Nom ou matricule de l’élève…' }}
      />

      {total > 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          <strong className="text-[color:var(--foreground)]">{total.toLocaleString('fr-FR')}</strong> absence(s) et retard(s) du{' '}
          {from} au {to}
          {sort === 'classe' ? ', par classe' : sort === 'eleve' ? ', par élève' : ', les plus récents d’abord'}
          {pages > 1 ? ` — page ${page} sur ${pages}` : ''}.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Aucune absence ni retard" hint="Sur la période choisie." />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">{sortHead('date', 'Date')}</th>
                <th className="px-3 py-2">{sortHead('eleve', 'Élève')}</th>
                <th className="px-3 py-2">{sortHead('classe', 'Classe')}</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2">{r.student}</td>
                  <td className="px-3 py-2">{r.klass}</td>
                  <td className="px-3 py-2">{r.subject}</td>
                  <td className="px-3 py-2">{r.status === 'ABSENT' ? 'Absent' : 'Retard'}</td>
                  <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
                    {r.status === 'LATE' ? `${r.minutes_late} min` : ''}{r.comment ? ` · ${r.comment}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          {page > 1 ? <Link href={lienPage(page - 1)} className="underline">← Plus récents</Link> : <span />}
          <span className="text-[color:var(--muted-foreground)]">Page {page} sur {pages}</span>
          {page < pages ? <Link href={lienPage(page + 1)} className="underline">Plus anciens →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
