import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { mergeQuery } from '@/lib/query/list';
import { CONTRACT_FILTERS, listTeachersOverview, type ContractCode, type TeacherOverview } from '@/features/teachers/queries';
import { EMPLOYMENT_OPTIONS, employmentLabel } from '@/lib/hr';
import { COURSE_HOUR_MINUTES } from '@/features/programme/hours';
import { ListFilters } from '@/components/data-table/ListFilters';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { MoreMenu, type MoreMenuItem } from '@/components/ui/more-menu';
import { StudentAvatar } from '@/components/ui/student-avatar';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { bulkCreateTeacherAccessAction } from '@/features/teachers/actions';

export const metadata: Metadata = { title: 'Enseignants' };

const PAGE_SIZE = 50;
const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
const soft = (v: string) => `color-mix(in srgb, ${v} 14%, transparent)`;
const pill = (bg: string, fg: string, text: string, key?: string) => (
  <span key={key} className="mb-0.5 mr-1 inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: bg, color: fg }}>
    {text}
  </span>
);

/**
 * Enseignants (maquette validée le 2026-10-30) : ce que chacun enseigne VRAIMENT
 * (matières et classes de ses affectations de l'année), filtres matière, classe
 * et contrat, un bouton principal et un menu « Plus » qui ne déborde plus.
 */
export default async function TeachersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.view');
  const base = `/e/${slug}/teachers`;

  const all = await listTeachersOverview(ctx, ctx.academicYear?.id ?? null);

  // --- Options des filtres, tirées des affectations.
  const subjects = new Map<string, string>();
  const classes = new Map<string, { name: string; levelId: string | null; order: number }>();
  for (const t of all) {
    for (const s of t.subjects) subjects.set(s.id, s.name);
    t.classes.forEach((c, i) => {
      if (!classes.has(c.id)) classes.set(c.id, { name: c.name, levelId: c.levelId, order: i });
    });
  }
  const contracts = EMPLOYMENT_OPTIONS.filter((o) => all.some((t) => t.employment_type === o.code));

  const f = {
    matiere: pick(sp.matiere),
    classe: pick(sp.classe),
    contrat: CONTRACT_FILTERS.find((c): c is ContractCode => c === pick(sp.contrat)) ?? '',
    q: pick(sp.q).trim().toLowerCase(),
  };
  const sort = pick(sp.tri) === 'matricule' ? 'matricule' : 'nom';
  const desc = pick(sp.ordre) === 'desc';
  const filtered = all
    .filter(
      (t) =>
        (!f.matiere || t.subjects.some((s) => s.id === f.matiere)) &&
        (!f.classe || t.classes.some((c) => c.id === f.classe)) &&
        (!f.contrat || t.employment_type === f.contrat) &&
        (!f.q || `${t.last_name} ${t.first_name} ${t.first_name} ${t.last_name} ${t.staff_number}`.toLowerCase().includes(f.q)),
    )
    .sort((a, b) => {
      const c = sort === 'matricule' ? byName(a.staff_number, b.staff_number) : byName(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`);
      return desc ? -c : c;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pick(sp.page), 10) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => ['matiere', 'classe', 'contrat', 'q', 'tri', 'ordre', 'page'].includes(k)));
  const canEdit = hasPermission(ctx, 'teachers.update');
  const missingAccess = all.filter((t) => !t.user_id).length;
  const canCreateAccess = hasPermission(ctx, 'access_accounts.create') && missingAccess > 0;
  const permanents = all.filter((t) => t.employment_type !== 'HOURLY').length;

  const num = (k: string) => Number(typeof sp[k] === 'string' ? sp[k] : 0) || 0;
  const bulkMessage =
    sp.bulk === '1'
      ? `Accès traités : ${num('c')} créé(s), ${num('l')} rattaché(s) à un accès existant${num('n') > 0 ? `, ${num('n')} sans téléphone` : ''}${num('f') > 0 ? `, ${num('f')} en échec` : ''}${num('r') > 0 ? `. Il en reste ${num('r')} : relancez.` : '.'}${num('c') > 0 ? ' Leurs identifiants sont en attente : envoyez-les depuis Gestion des accès.' : ''}`
      : null;

  const more: MoreMenuItem[] = [{ label: 'Service hebdomadaire', href: `${base}/service` }];
  if (hasPermission(ctx, 'teachers.payroll')) more.push({ label: 'Heures faites et paie', href: `${base}/heures` });
  more.push({ label: 'Importer / exporter', href: `/e/${slug}/import?type=teachers` });

  const sortHead = (key: 'nom' | 'matricule', label: string) => (
    <Link
      href={`${base}${mergeQuery(nav, { tri: key === 'nom' ? null : key, ordre: sort === key && !desc ? 'desc' : null, page: null })}`}
      scroll={false}
      className="inline-flex items-center gap-1 hover:underline"
    >
      {label}
      <span aria-hidden style={{ opacity: sort === key ? 1 : 0.35, color: sort === key ? 'var(--color-brand)' : undefined }}>
        {sort === key ? (desc ? '↓' : '↑') : '↕'}
      </span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Flash searchParams={sp} />
      {bulkMessage ? <Alert tone="success">{bulkMessage}</Alert> : null}
      <PageHeader
        title="Enseignants"
        description={`${all.length.toLocaleString('fr-FR')} enseignant${all.length > 1 ? 's' : ''} · ${permanents} permanent${permanents > 1 ? 's' : ''}, ${all.length - permanents} vacataire${all.length - permanents > 1 ? 's' : ''}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasPermission(ctx, 'teachers.create') ? (
              <Link href={`${base}/new`}>
                <Button>Nouvel enseignant</Button>
              </Link>
            ) : null}
            <MoreMenu items={more} />
          </div>
        }
      />
      {canCreateAccess ? (
        <Alert tone="info">
          {missingAccess} enseignant{missingAccess > 1 ? 's n’ont' : ' n’a'} pas encore d’accès à l’application.{' '}
          <span className="ml-1 inline-block align-middle">
            <SimpleSubmit action={bulkCreateTeacherAccessAction.bind(null, slug)} label="Créer les accès manquants" small />
          </span>
        </Alert>
      ) : null}

      <ListFilters
        basePath={base}
        keep={{ tri: pick(sp.tri), ordre: pick(sp.ordre) }}
        fields={[
          {
            name: 'matiere',
            label: 'Matière',
            allLabel: 'Toutes les matières',
            value: f.matiere,
            options: [...subjects].map(([id, name]) => ({ value: id, label: name })).sort((a, b) => byName(a.label, b.label)),
          },
          {
            name: 'classe',
            label: 'Classe',
            allLabel: 'Toutes les classes',
            value: f.classe,
            options: [...classes].map(([id, c]) => ({ value: id, label: c.name })).sort((a, b) => byName(a.label, b.label)),
          },
          { name: 'contrat', label: 'Contrat', allLabel: 'Tous', value: f.contrat, options: contracts.map((o) => ({ value: o.code, label: o.label })) },
        ]}
        search={{ value: pick(sp.q), placeholder: 'Nom ou matricule…' }}
      />
      <p className="px-1 text-xs text-[color:var(--muted-foreground)]">
        {filtered.length.toLocaleString('fr-FR')} enseignant{filtered.length > 1 ? 's' : ''}
        {filtered.length !== all.length ? ` sur ${all.length.toLocaleString('fr-FR')}` : ''}
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun enseignant pour ces filtres" hint="Changez de filtre ou effacez la recherche." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)' }}>
                  <th className="px-4 py-2.5">
                    {sortHead('nom', 'Nom')} <span className="mx-1 opacity-40">·</span> {sortHead('matricule', 'Matricule')}
                  </th>
                  <th className="px-4 py-2.5">Matières enseignées</th>
                  <th className="px-4 py-2.5">Classes</th>
                  <th className="px-4 py-2.5">Service</th>
                  <th className="px-4 py-2.5">Contrat</th>
                  <th className="px-4 py-2.5">Accès</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TeacherLine key={t.id} t={t} href={canEdit ? `${base}/${t.id}` : null} sortHead={sort === 'matricule'} />
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav className="flex items-center justify-between px-1" aria-label="Pages">
              <span className="text-xs text-[color:var(--muted-foreground)]">
                {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
              </span>
              <span className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={`${base}${mergeQuery(nav, { page: page - 1 === 1 ? null : page - 1 })}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                    ‹ Précédent
                  </Link>
                ) : null}
                <span className="text-xs text-[color:var(--muted-foreground)]">
                  Page {page} / {pages}
                </span>
                {page < pages ? (
                  <Link href={`${base}${mergeQuery(nav, { page: page + 1 })}`} className="rounded-xl border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
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

function TeacherLine({ t, href, sortHead }: { t: TeacherOverview; href: string | null; sortHead: boolean }) {
  const name = `${t.last_name.toUpperCase()} ${t.first_name}`;
  const hours = Math.round(t.weekly_minutes / COURSE_HOUR_MINUTES);
  return (
    <tr className="border-t align-top hover:bg-[color:var(--muted)]" style={{ borderColor: 'var(--border)' }}>
      <td className="px-4 py-2">
        <span className="flex items-center gap-2.5">
          <StudentAvatar name={`${t.last_name} ${t.first_name}`} size={8} />
          <span>
            {href ? (
              <Link href={href} className="font-semibold hover:underline">
                {name}
              </Link>
            ) : (
              <span className="font-semibold">{name}</span>
            )}
            <span className={`block font-mono text-xs ${sortHead ? 'text-[color:var(--color-brand)]' : 'text-[color:var(--muted-foreground)]'}`}>{t.staff_number}</span>
          </span>
        </span>
      </td>
      <td className="px-4 py-2">
        {t.subjects.length > 0 ? (
          t.subjects.map((s) => pill(soft('var(--color-brand)'), 'var(--color-brand)', s.name, s.id))
        ) : (
          <span className="text-xs text-[color:var(--muted-foreground)]">aucune affectation</span>
        )}
      </td>
      <td className="px-4 py-2">
        {t.classes.length > 0 ? (
          <span title={t.classes.map((c) => c.name).join(', ')}>
            <b>{t.classes.length}</b>{' '}
            <span className="text-xs text-[color:var(--muted-foreground)]">
              {t.classes
                .slice(0, 3)
                .map((c) => c.name)
                .join(', ')}
              {t.classes.length > 3 ? '…' : ''}
            </span>
          </span>
        ) : (
          <span className="text-[color:var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2">{hours > 0 ? `${hours} h / sem.` : <span className="text-[color:var(--muted-foreground)]">—</span>}</td>
      <td className="px-4 py-2">
        {t.employment_type === 'HOURLY'
          ? pill(soft('var(--color-warning)'), 'var(--color-warning)', employmentLabel(t.employment_type))
          : pill(soft('var(--color-success)'), 'var(--color-success)', employmentLabel(t.employment_type))}
      </td>
      <td className="px-4 py-2">
        {t.user_id
          ? pill(soft('var(--color-success)'), 'var(--color-success)', 'créé')
          : t.phone_e164
            ? pill('var(--muted)', 'var(--muted-foreground)', 'non créé')
            : pill(soft('var(--color-danger)'), 'var(--color-danger)', 'téléphone à renseigner')}
      </td>
    </tr>
  );
}
