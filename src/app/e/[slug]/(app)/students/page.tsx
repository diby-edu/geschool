import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery, parseListParams } from '@/lib/query/list';
import { listStudents, listStudentsPage, listClassFilterOptions, STUDENT_SORTABLE, type StudentRow, type StudentListRow } from '@/features/students/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';
import { ListFilters } from '@/components/data-table/ListFilters';
import { MoreMenu, type MoreMenuItem } from '@/components/ui/more-menu';
import { StudentAvatar } from '@/components/ui/student-avatar';

export const metadata: Metadata = { title: 'Élèves' };

const PAGE_SIZE = 50;
const SORTS = ['classe', 'nom', 'matricule'] as const;
/** Couleurs des niveaux, de la 6e à la Terminale (même suite que la page Générer). */
const LEVEL_COLORS = ['#4a44e0', '#12a99b', '#d98a00', '#d64545', '#0891b2', '#8b5cf6', '#16a06a'];
const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

const pill = (bg: string, fg: string, text: string) => (
  <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: bg, color: fg }}>
    {text}
  </span>
);
const soft = (v: string) => `color-mix(in srgb, ${v} 14%, transparent)`;

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.view');
  const base = `/e/${slug}/students`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Élèves" />
        <EmptyState title="Aucune année scolaire active" hint="Activez une année pour inscrire des élèves." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }

  // --- Liste filtrée et triée par la base (0161, maquette validée le 2026-10-30).
  const sort = (SORTS as readonly string[]).includes(pick(sp.tri)) ? (pick(sp.tri) as (typeof SORTS)[number]) : 'classe';
  const desc = pick(sp.ordre) === 'desc';
  const legacy = pick(sp.statut); // anciens liens « ?statut=affecte »
  const affectation = ['affecte', 'non-affecte', 'inconnu'].includes(pick(sp.affectation) || legacy) ? (pick(sp.affectation) || legacy) : '';
  const situation = ['redoublant', 'nouveau'].includes(pick(sp.situation)) ? pick(sp.situation) : '';
  const page = Math.max(1, Number.parseInt(pick(sp.page), 10) || 1);
  const [list, options] = await Promise.all([
    listStudentsPage(ctx, ctx.academicYear.id, {
      level: pick(sp.niveau) || undefined,
      classId: pick(sp.classe) || undefined,
      assigned: (affectation || undefined) as 'affecte' | 'non-affecte' | 'inconnu' | undefined,
      situation: (situation || undefined) as 'redoublant' | 'nouveau' | undefined,
      q: pick(sp.q) || undefined,
      sort,
      desc,
      page,
      pageSize: PAGE_SIZE,
    }),
    listClassFilterOptions(ctx, ctx.academicYear.id),
  ]);
  if (list) {
    const canView = hasPermission(ctx, 'students.view');
    const grouped = sort === 'classe' && pick(sp.groupe) !== '0';
    const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => ['niveau', 'classe', 'affectation', 'situation', 'q', 'tri', 'ordre', 'groupe', 'page'].includes(k)));
    const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
    const levelRank = new Map(options.levels.map((l, i) => [l.name, i]));
    const sortHref = (key: (typeof SORTS)[number]) =>
      `${base}${mergeQuery(nav, { tri: key === 'classe' ? null : key, ordre: sort === key && !desc ? 'desc' : null, page: null })}`;
    const sortHead = (key: (typeof SORTS)[number], label: string) => (
      <Link href={sortHref(key)} scroll={false} className="inline-flex items-center gap-1 hover:underline" aria-sort={sort === key ? (desc ? 'descending' : 'ascending') : undefined}>
        {label}
        <span aria-hidden style={{ opacity: sort === key ? 1 : 0.35, color: sort === key ? 'var(--color-brand)' : undefined }}>
          {sort === key ? (desc ? '↓' : '↑') : '↕'}
        </span>
      </Link>
    );
    const more: MoreMenuItem[] = [];
    if (hasPermission(ctx, 'students.create')) more.push({ label: 'Réinscription', href: `${base}/reinscription` });
    if (hasPermission(ctx, 'students.create')) more.push({ label: 'Importer / exporter', href: `/e/${slug}/import?type=students` });
    if (hasPermission(ctx, 'students.export')) more.push({ label: 'Exporter la liste (CSV)', href: `${base}/export${pick(sp.q) ? `?q=${encodeURIComponent(pick(sp.q))}` : ''}`, download: true });

    const rowsOut: React.ReactNode[] = [];
    let last = '';
    for (const r of list.rows) {
      const cls = r.class_name ?? 'Sans classe';
      if (grouped && cls !== last) {
        last = cls;
        rowsOut.push(
          <tr key={`g-${cls}`}>
            <td colSpan={7} className="border-t px-4 py-1.5 text-xs font-bold text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)', borderColor: 'var(--border)' }}>
              {cls}
            </td>
          </tr>,
        );
      }
      rowsOut.push(<StudentLine key={r.id} r={r} href={canView ? `${base}/${r.id}` : null} color={LEVEL_COLORS[(levelRank.get(r.level_name ?? '') ?? 0) % LEVEL_COLORS.length]!} />);
    }

    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Flash searchParams={sp} />
        <PageHeader
          title="Élèves"
          description={`Année ${ctx.academicYear.name} · ${list.total.toLocaleString('fr-FR')} élève${list.total > 1 ? 's' : ''}${nav.niveau || nav.classe || nav.affectation || nav.situation || nav.q ? ' pour ces filtres' : ` dans ${options.classes.length} classes`}`}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasPermission(ctx, 'students.create') ? (
                <Link href={`${base}/new`}>
                  <Button>Inscrire un élève</Button>
                </Link>
              ) : null}
              <MoreMenu items={more} />
            </div>
          }
        />
        <ListFilters
          basePath={base}
          keep={{ tri: pick(sp.tri), ordre: pick(sp.ordre), groupe: pick(sp.groupe) }}
          fields={[
            { name: 'niveau', label: 'Niveau', allLabel: 'Tous les niveaux', value: pick(sp.niveau), options: options.levels.map((l) => ({ value: l.id, label: l.name })) },
            { name: 'classe', label: 'Classe', allLabel: 'Toutes les classes', value: pick(sp.classe), dependsOn: 'niveau', options: options.classes.map((c) => ({ value: c.id, label: c.name, parent: c.levelId })) },
            {
              name: 'affectation',
              label: 'Affectation',
              allLabel: 'Toutes',
              value: affectation,
              options: [
                { value: 'affecte', label: 'Affecté' },
                { value: 'non-affecte', label: 'Non affecté' },
                { value: 'inconnu', label: 'Non renseignée' },
              ],
            },
            {
              name: 'situation',
              label: 'Situation',
              allLabel: 'Tous',
              value: situation,
              options: [
                { value: 'redoublant', label: 'Redoublants' },
                { value: 'nouveau', label: 'Nouveaux' },
              ],
            },
          ]}
          search={{ value: pick(sp.q), placeholder: 'Nom, prénom ou matricule…' }}
        >
          {sort === 'classe' ? (
            <Link
              href={`${base}${mergeQuery(nav, { groupe: grouped ? '0' : null, page: null })}`}
              scroll={false}
              className="flex h-9 items-center gap-1.5 self-end rounded-xl border px-3 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span aria-hidden>{grouped ? '☑' : '☐'}</span> Regrouper par classe
            </Link>
          ) : null}
        </ListFilters>

        {list.total === 0 ? (
          <EmptyState title="Aucun élève pour ces filtres" hint="Changez de filtre ou effacez la recherche." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)' }}>
                    <th className="px-4 py-2.5">{sortHead('nom', 'Nom')}</th>
                    <th className="px-4 py-2.5">{sortHead('matricule', 'Matricule')}</th>
                    <th className="px-4 py-2.5">{sortHead('classe', 'Classe')}</th>
                    <th className="px-4 py-2.5">Sexe</th>
                    <th className="px-4 py-2.5">Affectation</th>
                    <th className="px-4 py-2.5">Situation</th>
                    <th className="px-4 py-2.5">Parent</th>
                  </tr>
                </thead>
                <tbody>{rowsOut}</tbody>
              </table>
            </div>
            <Pager
              page={Math.min(page, pages)}
              pages={pages}
              total={list.total}
              href={(n) => `${base}${mergeQuery(nav, { page: n === 1 ? null : n })}`}
            />
          </>
        )}
      </div>
    );
  }

  // --- Avant la migration 0161 : l'ancienne liste.
  const listParams = parseListParams(sp, { sortable: STUDENT_SORTABLE, defaultSort: 'last_name' });
  const askedAssigned = typeof sp.statut === 'string' ? sp.statut : '';
  const assigned = askedAssigned === 'affecte' || askedAssigned === 'non-affecte' ? askedAssigned : undefined;
  const { rows, total } = await listStudents(ctx, ctx.academicYear.id, listParams, {
    ...(assigned ? { assigned } : {}),
  });
  const canView = hasPermission(ctx, 'students.view');

  const columns: Column<StudentRow>[] = [
    { key: 'last_name', header: 'Nom', render: (r) => `${r.last_name.toUpperCase()} ${r.first_name}` },
    { key: 'matricule', header: 'Matricule', render: (r) => <span className="font-mono">{r.matricule}</span> },
    { key: 'class_name', header: 'Classe', render: (r) => r.class_name ?? '—' },
    {
      key: 'is_state_assigned',
      header: 'Statut',
      render: (r) => (
        <span className={r.is_state_assigned === null ? 'text-[color:var(--muted-foreground)]' : ''}>
          {r.is_state_assigned === null ? 'Non renseigné' : r.is_state_assigned ? 'Affecté' : 'Non affecté'}
          {r.is_repeating ? ' · redoublant' : ''}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Élèves"
        description={`Année ${ctx.academicYear.name}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`${base}/reinscription`}>
                <Button variant="ghost">Réinscription</Button>
              </Link>
            ) : null}
            {hasPermission(ctx, 'students.export') ? (
              // Route de telechargement (pas une page) : un <a> simple, sans prefetch.
              <a href={`${base}/export${listParams.q ? `?q=${encodeURIComponent(listParams.q)}` : ''}`} download>
                <Button variant="secondary">
                  {listParams.q ? 'Exporter cette recherche (CSV)' : 'Exporter la liste (CSV)'}
                </Button>
              </a>
            ) : null}
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`/e/${slug}/import?type=students`}>
                <Button variant="secondary">Importer / exporter</Button>
              </Link>
            ) : null}
            {hasPermission(ctx, 'students.create') ? (
              <Link href={`${base}/new`}>
                <Button>Inscrire un élève</Button>
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="mb-4">
        <SearchBar basePath={base} defaultValue={listParams.q} placeholder="Nom ou matricule…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        rowHref={canView ? (r) => `${base}/${r.id}` : undefined}
        emptyLabel="Aucun élève inscrit."
      />
    </div>
  );
}

function StudentLine({ r, href, color }: { r: StudentListRow; href: string | null; color: string }) {
  const name = `${r.last_name.toUpperCase()} ${r.first_name}`;
  return (
    <tr className="border-t hover:bg-[color:var(--muted)]" style={{ borderColor: 'var(--border)' }}>
      <td className="px-4 py-2">
        <span className="flex items-center gap-2.5">
          <StudentAvatar name={`${r.last_name} ${r.first_name}`} size={8} />
          {href ? (
            <Link href={href} className="font-semibold hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-semibold">{name}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-2 font-mono text-xs">{r.matricule}</td>
      <td className="px-4 py-2">{r.class_name ? pill(`${color}1a`, color, r.class_name) : <span className="text-[color:var(--muted-foreground)]">—</span>}</td>
      <td className="px-4 py-2">{r.gender === 'F' ? 'Fille' : r.gender === 'M' ? 'Garçon' : <span className="text-[color:var(--muted-foreground)]">—</span>}</td>
      <td className="px-4 py-2">
        {r.is_state_assigned === null ? (
          <span className="text-[color:var(--muted-foreground)]" title="Non renseignée">—</span>
        ) : r.is_state_assigned ? (
          pill(soft('var(--color-success)'), 'var(--color-success)', 'Affecté')
        ) : (
          pill('var(--muted)', 'var(--muted-foreground)', 'Non affecté')
        )}
      </td>
      <td className="px-4 py-2">
        {r.is_repeating ? (
          pill(soft('var(--color-warning)'), 'var(--color-warning)', 'Redoublant')
        ) : r.is_new ? (
          pill(soft('var(--color-brand)'), 'var(--color-brand)', 'Nouveau')
        ) : (
          <span className="text-[color:var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-xs">
        {r.guardian_phone ?? pill(soft('var(--color-danger)'), 'var(--color-danger)', 'aucun numéro')}
      </td>
    </tr>
  );
}

function Pager({ page, pages, total, href }: { page: number; pages: number; total: number; href: (n: number) => string }) {
  if (pages <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const btn = 'rounded-xl border px-3 py-1.5 text-sm font-semibold';
  return (
    <nav className="flex items-center justify-between px-1" aria-label="Pages">
      <span className="text-xs text-[color:var(--muted-foreground)]">
        {from.toLocaleString('fr-FR')} – {to.toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}
      </span>
      <span className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn} style={{ borderColor: 'var(--border)' }}>
            ‹ Précédent
          </Link>
        ) : null}
        <span className="text-xs text-[color:var(--muted-foreground)]">
          Page {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={btn} style={{ borderColor: 'var(--border)' }}>
            Suivant ›
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
