import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getConfig, listCyclesOverview } from '@/features/schedule/config';
import { listRequirements, loadProgrammeMinutes, programmeDrift, type RequirementRow } from '@/features/schedule/requirements';
import { listRoomTypes, listRoomFeatures, listActiveRoomOptions } from '@/features/rooms/queries';
import { listGenerationJobs } from '@/features/schedule/generation';
import { syncRequirementsAction, generateScheduleAction, alignProgrammeAction } from '@/features/schedule/actions';
import { GenerateRequirements, type GenGroup, type GenRow } from '@/features/schedule/components/GenerateRequirements';
import { BulkBlocksForm, type BulkTarget } from '@/features/schedule/components/BulkBlocksForm';
import { ListFilters } from '@/components/data-table/ListFilters';
import { mergeQuery } from '@/lib/query/list';
import { COURSE_HOUR_MINUTES } from '@/features/programme/hours';
import { GenerateForm } from '@/features/schedule/components/GenerateForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Génération de l\'emploi du temps' };

const PAGE_SIZE = 50;
const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

const JOB_STATUS: Record<string, string> = {
  QUEUED: 'En file',
  RUNNING: 'En cours',
  SUCCEEDED: 'Reussie',
  INFEASIBLE: 'Impossible',
  FAILED: 'Échec',
  CANCELLED: 'Annulee',
};

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.generate');
  requireFeature(ctx, 'schedule');
  const base = `/e/${slug}/schedule`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Génération" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }} />
      </div>
    );
  }

  const yearId = ctx.academicYear.id;
  const config = await getConfig(ctx, yearId);
  const cyclesOverview = await listCyclesOverview(ctx, yearId);
  const cyclesWithOwnGrid = cyclesOverview.filter((c) => c.configId).map((c) => ({ id: c.id, name: c.name }));
  // Une grille existe des qu'il y a soit la grille par defaut, soit au moins
  // une grille de cycle — un etablissement entierement decoupe en cycles
  // (§ decision "pause par cycle") n'a jamais de grille par defaut du tout.
  const hasAnyGrid = config !== null || cyclesWithOwnGrid.length > 0;
  // Programme lu en même temps que les cours : il sert à repérer les volumes qui ne le suivent plus.
  const [requirements, programme] = hasAnyGrid ? await Promise.all([listRequirements(ctx, yearId), loadProgrammeMinutes(ctx)]) : [[], new Map<string, number>()];
  // Cibles possibles d'une règle de salle : les types d'abord (« un laboratoire »),
  // puis les salles précises (« le laboratoire B12 »).
  const [roomTypes, roomFeatures, roomList] = hasAnyGrid
    ? await Promise.all([listRoomTypes(ctx), listRoomFeatures(ctx), listActiveRoomOptions(ctx)])
    : [[], [], []];
  const roomChoices = [
    ...roomTypes.map((t) => ({ id: t.id, name: t.name, kind: 'TYPE' as const })),
    ...roomList.map((r) => ({ id: r.id, name: r.name, kind: 'ROOM' as const })),
  ];
  const jobs = hasAnyGrid ? await listGenerationJobs(ctx, yearId, 5) : [];
  const activeCount = requirements.filter((r) => r.status === 'ACTIVE').length;
  const targetVersionId = typeof sp.version === 'string' ? sp.version : undefined;

  const canSync = hasPermission(ctx, 'schedule.create');
  const canEdit = hasPermission(ctx, 'schedule.update');
  const canDelete = hasPermission(ctx, 'schedule.delete');

  // --- La vraie salle de chaque cours (maquette : jamais « n'importe quelle salle »).
  // « SALLE-1 — Salle 1 » → « Salle 1 » : le code n'apprend rien à côté du nom.
  const roomName = new Map(roomList.map((r) => [r.id, r.name.includes(' — ') ? r.name.split(' — ').slice(1).join(' — ') : r.name]));
  const typeName = new Map(roomTypes.map((t) => [t.id, t.name]));
  const roomOf = (r: RequirementRow): GenRow['room'] => {
    const home = r.classes.length === 1 && r.classes[0]!.main_room_id ? roomName.get(r.classes[0]!.main_room_id) : undefined;
    const ids = r.room_ids;
    switch (r.room_mode) {
      case 'REQUIRED_ROOM':
        return { main: roomName.get(ids.required_room ?? '') ?? 'Salle imposée', note: 'imposée' };
      case 'REQUIRED_TYPE':
        return { main: typeName.get(ids.required_type ?? '') ?? 'Type de salle imposé', note: 'imposé' };
      case 'PREFERRED': {
        const wanted = ids.preferred_room ? roomName.get(ids.preferred_room) : typeName.get(ids.preferred_type ?? '');
        return { main: `${wanted ?? 'Salle choisie'} de préférence`, note: home ? `sinon ${home}` : 'sinon une salle libre' };
      }
      default:
        if (home) return { main: home, note: 'salle de la classe' };
        return { main: 'Salle libre', note: r.classes.length > 1 ? 'cours commun : choisie à la génération' : 'pas de salle attitrée' };
    }
  };

  // --- Options des filtres, tirées des enseignements eux-mêmes.
  const levelsMap = new Map<string, { id: string; name: string; seq: number }>();
  const classesMap = new Map<string, { id: string; name: string; level: string; seq: number }>();
  const subjectsMap = new Map<string, string>();
  const teachersMap = new Map<string, string>();
  const numbers = new Map<string, string>();
  for (const r of requirements) {
    subjectsMap.set(r.subject_id, r.subject);
    const names = r.teachers.split(', ');
    r.teacher_ids.forEach((id, i) => {
      teachersMap.set(id, names[i] ?? '—');
      numbers.set(id, r.teacher_numbers[i] ?? '');
    });
    for (const c of r.classes) {
      if (c.level_id) levelsMap.set(c.level_id, { id: c.level_id, name: c.level_name ?? '—', seq: c.level_sequence });
      classesMap.set(c.id, { id: c.id, name: c.name, level: c.level_id ?? '', seq: c.level_sequence });
    }
  }
  const levels = [...levelsMap.values()].sort((a, b) => a.seq - b.seq);
  const classes = [...classesMap.values()].sort((a, b) => a.seq - b.seq || byName(a.name, b.name));
  const subjects = [...subjectsMap].map(([id, name]) => ({ id, name })).sort((a, b) => byName(a.name, b.name));
  // Deux enseignants du même nom : le matricule les distingue dans la liste.
  const sameName = new Map<string, number>();
  for (const n of teachersMap.values()) sameName.set(n, (sameName.get(n) ?? 0) + 1);
  const teachers = [...teachersMap]
    .map(([id, name]) => ({ id, name: (sameName.get(name) ?? 0) > 1 && numbers.get(id) ? `${name} · ${numbers.get(id)}` : name }))
    .sort((a, b) => byName(a.name, b.name));
  const levelRank = new Map(levels.map((l, i) => [l.id, i]));

  // --- Filtres (dans l'adresse) et tri par classe.
  const f = { niveau: pick(sp.niveau), classe: pick(sp.classe), matiere: pick(sp.matiere), prof: pick(sp.prof), decoupage: pick(sp.decoupage), q: pick(sp.q).trim().toLowerCase() };
  const filtered = requirements
    .filter(
      (r) =>
        (!f.niveau || r.classes.some((c) => c.level_id === f.niveau)) &&
        (!f.classe || r.classes.some((c) => c.id === f.classe)) &&
        (!f.matiere || r.subject_id === f.matiere) &&
        (!f.prof || r.teacher_ids.includes(f.prof)) &&
        (!f.decoupage || (f.decoupage === '1' ? r.blocks.every((b) => b === 1) : r.blocks.some((b) => b > 1))) &&
        (!f.q || `${r.target} ${r.subject} ${r.teachers}`.toLowerCase().includes(f.q)),
    )
    .sort((a, b) => (a.classes[0]?.level_sequence ?? 999) - (b.classes[0]?.level_sequence ?? 999) || byName(a.target, b.target) || byName(a.subject, b.subject));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pick(sp.page), 10) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const classTotals = new Map<string, { count: number; hours: number }>();
  for (const r of filtered) {
    const t = classTotals.get(r.target) ?? { count: 0, hours: 0 };
    t.count++;
    t.hours += Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES);
    classTotals.set(r.target, t);
  }
  const groups: GenGroup[] = [];
  for (const r of shown) {
    const row: GenRow = {
      id: r.id,
      target: r.target,
      levelRank: levelRank.get(r.classes[0]?.level_id ?? '') ?? 0,
      subject: r.subject,
      teachers: r.teachers,
      hours: Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES),
      blocks: r.blocks,
      room: roomOf(r),
      roomMode: r.room_mode,
      roomTarget: r.room_target,
      minCapacity: r.min_capacity,
      requiredFeatures: r.required_features,
      status: r.status,
    };
    const last = groups[groups.length - 1];
    if (last && last.key === r.target) last.rows.push(row);
    else groups.push({ key: r.target, title: r.target, rows: [row], ...(classTotals.get(r.target) ?? { count: 1, hours: row.hours }) });
  }
  // Une classe coupée par la pagination : « (suite) » en haut de la page suivante.
  if (groups[0] && page > 1 && filtered[(page - 1) * PAGE_SIZE - 1]?.target === groups[0].key) groups[0].title = `${groups[0].key} (suite)`;

  // --- Découper en une fois : matière × niveau, avec les volumes rencontrés.
  const bulk = new Map<string, BulkTarget>();
  for (const r of requirements) {
    if (r.classes.length !== 1 || !r.classes[0]!.level_id) continue;
    const key = `${r.subject_id}:${r.classes[0]!.level_id}`;
    const t = bulk.get(key) ?? { subjectId: r.subject_id, levelId: r.classes[0]!.level_id, classes: 0, hours: [] };
    t.classes++;
    t.hours.push(Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES));
    bulk.set(key, t);
  }

  const drifts = programmeDrift(requirements, programme);
  const driftCount = drifts.reduce((n, d) => n + d.ids.length, 0);
  const totalWeekHours = requirements.filter((r) => r.status === 'ACTIVE').reduce((n, r) => n + Math.round(r.weekly_minutes / COURSE_HOUR_MINUTES), 0);

  // Requête de la page, pour revenir au même endroit après un enregistrement.
  const nav = Object.fromEntries(Object.entries(sp).filter(([k]) => ['niveau', 'classe', 'matiere', 'prof', 'decoupage', 'q', 'page'].includes(k)));
  const back = mergeQuery(nav, {});
  const pageHref = (n: number) => `${base}/generate${mergeQuery(nav, { page: n === 1 ? null : n })}`;
  const flashNum = (k: string) => (typeof sp[k] === 'string' ? Number(sp[k]) : null);
  const decoupe = flashNum('decoupe');
  const ignores = flashNum('ignores');
  const aligne = flashNum('aligne');

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Flash searchParams={sp} />
      {sp.synced !== undefined ? (
        <Alert tone="success">
          {sp.synced} enseignement(s) ajouté(s) depuis les affectations{sp.kept && sp.kept !== '0' ? `, ${sp.kept} déjà présent(s).` : '.'}
        </Alert>
      ) : null}
      {sp.updated === '1' ? <Alert tone="success">Enregistré.</Alert> : null}
      {sp.reqdeleted === '1' ? <Alert tone="success">Enseignement retiré des cours à placer.</Alert> : null}
      {decoupe !== null ? (
        <Alert tone="success">
          Découpage appliqué à {decoupe} classe{decoupe > 1 ? 's' : ''}.
          {ignores ? ` ${ignores} classe${ignores > 1 ? 's' : ''} à un autre volume, inchangée${ignores > 1 ? 's' : ''}.` : ''}
        </Alert>
      ) : null}
      {aligne !== null ? <Alert tone="success">{aligne} enseignement(s) remis au volume du programme. Pensez à relancer la génération.</Alert> : null}

      <PageHeader
        title="Générer l'emploi du temps"
        description={`Année ${ctx.academicYear.name} · ${requirements.length.toLocaleString('fr-FR')} enseignements · ${totalWeekHours.toLocaleString('fr-FR')} heures de cours par semaine`}
        action={
          <Link href={base}>
            <Button variant="ghost">Retour à l’emploi du temps</Button>
          </Link>
        }
      />

      {!hasAnyGrid ? (
        <EmptyState title="Horaires non configurés" hint="Définissez d'abord les jours et horaires de cette année, depuis Années scolaires." />
      ) : (
        <>
          <div className="grid gap-2.5 md:grid-cols-3">
            {[
              { n: '①', t: 'Heures par semaine', d: 'Réglées par niveau et par matière dans', link: { href: `/e/${slug}/programme`, label: 'Programme' }, on: false },
              { n: '②', t: 'Qui enseigne quoi', d: 'Chaque matière de chaque classe a son professeur dans', link: { href: `/e/${slug}/assignments`, label: 'Affectations' }, on: false },
              { n: '③', t: 'Découpage et génération', d: 'Ici : comment répartir les heures (2+2, 1+1+1+1…), puis « Générer ».', link: null, on: true },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border px-4 py-3" style={{ borderColor: s.on ? 'var(--color-brand)' : 'var(--border)', backgroundColor: 'var(--surface)' }}>
                <div className="text-sm font-extrabold" style={s.on ? { color: 'var(--color-brand)' } : undefined}>
                  {s.n} {s.t}
                </div>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {s.d}{' '}
                  {s.link ? (
                    <Link href={s.link.href} className="font-semibold text-[color:var(--color-brand)] hover:underline">
                      {s.link.label}
                    </Link>
                  ) : null}
                  {s.link ? '.' : null}
                </p>
              </div>
            ))}
          </div>

          {driftCount > 0 ? (
            <Alert tone="warning">
              <b>Le programme a changé</b> pour {driftCount} enseignement{driftCount > 1 ? 's' : ''} :{' '}
              {drifts
                .slice(0, 4)
                .map((d) => `${d.label} ${d.fromHours} h → ${d.toHours} h (${d.ids.length} classe${d.ids.length > 1 ? 's' : ''})`)
                .join(' ; ')}
              {drifts.length > 4 ? '…' : '.'} Ces cours gardent l’ancien volume tant que vous ne les mettez pas à jour ; leur découpage repartira en cours d’1 h.
              {canEdit ? (
                <span className="ml-2 inline-block align-middle">
                  <SimpleSubmit action={alignProgrammeAction.bind(null, slug)} label="Mettre à jour depuis le programme" small hidden={{ back }} />
                </span>
              ) : null}
            </Alert>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[color:var(--muted-foreground)]">
                Les cours à placer : une ligne par matière et par classe. Une nouvelle affectation n’apparaît ici qu’après la synchronisation.
              </p>
              {canSync ? <SimpleSubmit action={syncRequirementsAction.bind(null, slug)} label="Synchroniser depuis les affectations" small /> : null}
            </div>

            {requirements.length === 0 ? (
              <EmptyState title="Aucun cours à placer" hint="Synchronisez depuis les affectations pour convertir les volumes horaires en cours à placer." />
            ) : (
              <>
                {canEdit ? (
                  <BulkBlocksForm
                    slug={slug}
                    back={back}
                    subjects={subjects}
                    levels={levels.map((l) => ({ id: l.id, name: l.name }))}
                    targets={[...bulk.values()]}
                  />
                ) : null}

                <ListFilters
                  basePath={`${base}/generate`}
                  fields={[
                    { name: 'niveau', label: 'Niveau', allLabel: 'Tous les niveaux', value: f.niveau, options: levels.map((l) => ({ value: l.id, label: l.name })) },
                    { name: 'classe', label: 'Classe', allLabel: 'Toutes les classes', value: f.classe, dependsOn: 'niveau', options: classes.map((c) => ({ value: c.id, label: c.name, parent: c.level })) },
                    { name: 'matiere', label: 'Matière', allLabel: 'Toutes les matières', value: f.matiere, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                    { name: 'prof', label: 'Enseignant', allLabel: 'Tous les enseignants', value: f.prof, options: teachers.map((t) => ({ value: t.id, label: t.name })) },
                    {
                      name: 'decoupage',
                      label: 'Découpage',
                      allLabel: 'Tous',
                      value: f.decoupage,
                      options: [
                        { value: '1', label: 'Seulement des cours d’1 h' },
                        { value: 'n', label: 'Avec des cours de plusieurs heures' },
                      ],
                    },
                  ]}
                  search={{ value: pick(sp.q), placeholder: 'Classe, matière ou professeur…' }}
                />

                <p className="px-1 text-xs text-[color:var(--muted-foreground)]">
                  {filtered.length.toLocaleString('fr-FR')} enseignement{filtered.length > 1 ? 's' : ''}
                  {filtered.length !== requirements.length ? ` sur ${requirements.length.toLocaleString('fr-FR')}` : ''} · triés par classe
                </p>

                {filtered.length === 0 ? (
                  <EmptyState title="Aucun enseignement pour ces filtres" hint="Changez de filtre ou effacez la recherche." />
                ) : (
                  <>
                    <GenerateRequirements slug={slug} back={back} groups={groups} canEdit={canEdit && canDelete} roomChoices={roomChoices} features={roomFeatures} />
                    {pages > 1 ? (
                      <nav className="flex items-center justify-between px-1 text-sm" aria-label="Pages">
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          {((page - 1) * PAGE_SIZE + 1).toLocaleString('fr-FR')} – {Math.min(page * PAGE_SIZE, filtered.length).toLocaleString('fr-FR')} sur{' '}
                          {filtered.length.toLocaleString('fr-FR')}
                        </span>
                        <span className="flex gap-2">
                          {page > 1 ? (
                            <Link href={pageHref(page - 1)} className="rounded-xl border px-3 py-1.5 font-semibold" style={{ borderColor: 'var(--border)' }}>
                              ‹ Précédent
                            </Link>
                          ) : null}
                          <span className="px-2 py-1.5 text-xs text-[color:var(--muted-foreground)]">
                            Page {page} / {pages}
                          </span>
                          {page < pages ? (
                            <Link href={pageHref(page + 1)} className="rounded-xl border px-3 py-1.5 font-semibold" style={{ borderColor: 'var(--border)' }}>
                              Suivant ›
                            </Link>
                          ) : null}
                        </span>
                      </nav>
                    ) : null}
                  </>
                )}
              </>
            )}
          </section>

          <GenerateForm
            action={generateScheduleAction.bind(null, slug)}
            requirementCount={activeCount}
            cycles={cyclesWithOwnGrid}
            hasDefaultGrid={config !== null}
            {...(targetVersionId ? { targetVersionId } : {})}
          />

          {jobs.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
                Dernieres generations
              </h2>
              <ul className="space-y-2">
                {jobs.map((j) => (
                  <li key={j.id} className="rounded-[--radius-card] border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{JOB_STATUS[j.status] ?? j.status}</span>
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {new Date(j.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {j.sessions_count != null ? `${j.sessions_count} séance(s) placée(s)` : '—'}
                      {j.solver_status ? ` · ${j.solver_status}` : ''}
                      {j.duration_ms != null ? ` · ${(j.duration_ms / 1000).toFixed(1)} s` : ''}
                    </p>
                    {j.problems.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-xs text-[color:var(--muted-foreground)]">
                        {j.problems.slice(0, 4).map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
