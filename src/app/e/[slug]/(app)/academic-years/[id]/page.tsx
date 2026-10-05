import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getYear, listCalendarEvents, listGradingWindows, listPeriods } from '@/features/academic-years/queries';
import { officialCalendarFor, officialScopes, officialBreakName, MOVABLE_HOLIDAYS_NOTE } from '@/features/academic-years/official-calendar-ci';
import { CalendarEventForm } from '@/features/academic-years/components/CalendarEventForm';
import { PeriodEditForm } from '@/features/academic-years/components/PeriodEditForm';
import { gradingState } from '@/features/academic-years/grading';
import { schoolToday } from '@/features/dashboard/time';
import { GradingWindowForm } from '@/features/academic-years/components/GradingWindowForm';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { YEAR_STATUS_LABEL, PERIOD_KIND_LABEL, CALENDAR_KIND_LABEL, formatDate, longDate, daysBetween, periodPhase } from '@/features/academic-years/labels';
import { EditableItem } from '@/features/academic-years/components/EditableItem';
import {
  updateYearAction, createPeriodAction, deletePeriodAction, setGradingWindowAction, setGradingOverrideAction,
  createCalendarEventAction, deleteCalendarEventAction, applyOfficialCalendarAction, updatePeriodAction, updateCalendarEventAction,
} from '@/features/academic-years/actions';
import { getConfig, getDayHours, getBreaks, listCyclesOverview } from '@/features/schedule/config';
import { schoolTracks } from '@/features/structure/queries';
import { periodScopeLabel, formatTracks } from '@/features/academic-years/periods-by-track';
import { saveConfigAction } from '@/features/schedule/actions';
import { YearForm } from '@/features/academic-years/components/YearForm';
import { PeriodCreateForm } from '@/features/academic-years/components/PeriodCreateForm';
import { ConfigForm } from '@/features/schedule/components/ConfigForm';
import { GridSummary } from '@/features/schedule/components/GridSummary';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: "Année scolaire" };

export default async function YearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'academic_years.view');

  const year = await getYear(ctx, id);
  if (!year) notFound();
  const [periods, events, tracks] = await Promise.all([listPeriods(ctx, id), listCalendarEvents(ctx, id), schoolTracks(ctx)]);
  const official = officialCalendarFor(year.name);
  // Déjà conforme : mêmes trimestres (rang et dates) et mêmes congés (nom et dates).
  // Ce que le calendrier officiel poserait ICI : trimestres du général, semestres
  // du technique et du professionnel, chacun avec ses congés.
  const scopes = officialScopes(tracks);
  const plannedPeriods = official
    ? [
        ...(scopes.hasGeneral ? official.periods.map((p) => ({ ...p, kind: 'TERM' as const })) : []),
        ...(scopes.techPro.length > 0 ? official.semesters.map((p) => ({ ...p, kind: 'SEMESTER' as const })) : []),
      ]
    : [];
  const plannedBreaks = official
    ? [
        ...(scopes.hasGeneral ? official.breaks.map((b) => ({ ...b, name: officialBreakName(b.name, b.kind, scopes.generalSuffix) })) : []),
        ...(scopes.techPro.length > 0
          ? official.technicalBreaks.map((b) => ({ ...b, name: officialBreakName(b.name, b.kind, scopes.techSuffix) }))
          : []),
      ]
    : [];
  const officialApplied =
    official !== null &&
    plannedPeriods.every((o) =>
      periods.some((p) => p.kind === o.kind && p.sequence === o.sequence && p.starts_on === o.startsOn && p.ends_on === o.endsOn),
    ) &&
    plannedBreaks.every((o) => events.some((e) => e.name.toLowerCase() === o.name.toLowerCase() && e.starts_on === o.startsOn && e.ends_on === o.endsOn));
  const officialFlash = typeof sp.official === 'string' ? sp.official.split('-').map(Number) : null;
  // Fenetres de calcul des moyennes (migration 0056) : null tant qu'elle n'est pas appliquee.
  const windows = await listGradingWindows(ctx, id);
  const today = schoolToday(ctx.school.timezone);
  const canManage = hasPermission(ctx, 'academic_years.manage');
  const editable = year.status === 'DRAFT' || year.status === 'ACTIVE';

  // La fiche d'une année est longue (trimestres, congés, horaires) : des onglets
  // plutôt qu'un seul défilement. L'onglet vit dans l'URL (composant serveur) et
  // les actions y reviennent après enregistrement.
  // La formation professionnelle fonctionne par SEMESTRES : son onglet n'apparaît
  // que si l'établissement a cet ordre d'enseignement.
  // Le technique ET le professionnel fonctionnent par semestres : l'onglet
  // n'apparaît que si l'établissement a l'un de ces deux ordres.
  const semesterTracks = ['TECHNIQUE', 'PROFESSIONNEL'] as const;
  const hasPro = semesterTracks.some((t) => tracks.includes(t));
  // « Semestres · technique » dans une école générale + technique, « · technique
  // et professionnel » quand elle a les deux : le titre nomme les ordres réels.
  const semesterScope = periodScopeLabel(semesterTracks.filter((t) => tracks.includes(t))) ?? 'enseignement technique';
  const semesterPeriods = periods.filter(
    (p) => p.kind === 'SEMESTER' || (p.tracks ?? []).some((t) => semesterTracks.includes(t as 'TECHNIQUE' | 'PROFESSIONNEL')),
  );
  const termPeriods = periods.filter((p) => !semesterPeriods.includes(p));
  const TABS = [
    { key: 'trimestres', label: 'Trimestres' },
    ...(hasPro ? ([{ key: 'semestres', label: 'Semestres' }] as const) : []),
    { key: 'conges', label: 'Congés et jours fériés' },
    { key: 'horaires', label: 'Jours et horaires' },
    { key: 'infos', label: 'Informations' },
  ] as const;
  const asked = typeof sp.onglet === 'string' ? sp.onglet : '';
  const tab = (TABS.find((t) => t.key === asked)?.key ?? 'trimestres') as (typeof TABS)[number]['key'];
  const tabHref = (key: string) => `/e/${slug}/academic-years/${id}?onglet=${key}`;
  const shownPeriods = tab === 'semestres' ? semesterPeriods : termPeriods;
  const nextSeqShown = shownPeriods.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;

  // Jours et horaires : donnee propre a CETTE annee (schedule_configurations
  // porte un academic_year_id), pas un reglage general de l'etablissement —
  // au meme titre que les periodes ci-dessous. Droit distinct de
  // 'academic_years.manage' : un censeur peut configurer les horaires sans
  // pouvoir renommer l'annee ou en creer une nouvelle.
  const canManageHours = hasPermission(ctx, 'schedule.manage_configuration');
  const config = canManageHours ? await getConfig(ctx, id) : null;
  const [dayHours, breaks, cycles] = canManageHours
    ? await Promise.all([
        config ? getDayHours(ctx, config.id) : Promise.resolve([]),
        config ? getBreaks(ctx, config.id) : Promise.resolve([]),
        listCyclesOverview(ctx, id),
      ])
    : [[], [], []];
  // Aucune classe ne suit la grille de l'établissement quand chaque cycle a la sienne.
  const allCyclesOwnGrid = cycles.length > 0 && cycles.every((c) => c.grid);
  const hoursDefaults = config
    ? { workingDays: config.working_days as number[], dayHours, slotMinutes: config.default_session_minutes as number, breaks }
    : { workingDays: [1, 2, 3, 4, 5], dayHours: [], slotMinutes: 55, breaks: [] };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {sp.configured === '1' ? <Alert tone="success">Horaires enregistrés.</Alert> : null}
      {officialFlash ? (
        <Alert tone="success">
          Calendrier officiel appliqué : {officialFlash[0] ?? 0} trimestre(s) et {officialFlash[1] ?? 0} congé(s) mis à jour. Les séances prévues pendant les congés sont annulées automatiquement.
        </Alert>
      ) : null}
      <PageHeader
        title={year.name}
        description={`${formatDate(year.starts_on)} — ${formatDate(year.ends_on)} · ${YEAR_STATUS_LABEL[year.status] ?? year.status}`}
        action={
          <Link href={`/e/${slug}/academic-years`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <nav aria-label="Sections de l’année" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              aria-current={active ? 'page' : undefined}
              className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === 'infos' && canManage && editable ? (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Informations
          </h2>
          <YearForm
            action={updateYearAction.bind(null, slug, id)}
            submitLabel="Enregistrer"
            defaultValues={{ name: year.name, startsOn: year.starts_on, endsOn: year.ends_on }}
          />
        </section>
      ) : null}

      {tab === 'trimestres' && official && canManage && editable ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="font-medium">Calendrier officiel {year.name}</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              {official.source}. Tout reste modifiable ensuite, et vous pouvez compléter (autres jours fériés).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ...(scopes.hasGeneral
                  ? [
                      {
                        title: scopes.both ? 'Trimestres · général' : 'Trimestres',
                        items: official.periods.map((p) => ({ key: `t-${p.sequence}`, name: p.name, from: p.startsOn, to: p.endsOn })),
                      },
                      {
                        title: scopes.both ? 'Congés · général' : 'Congés',
                        items: official.breaks
                          .filter((b) => b.kind === 'VACATION')
                          .map((b) => ({ key: `cg-${b.name}`, name: b.name, from: b.startsOn, to: b.endsOn })),
                      },
                    ]
                  : []),
                ...(scopes.techPro.length > 0
                  ? [
                      {
                        title: scopes.both ? `Semestres · ${semesterScope}` : 'Semestres',
                        items: official.semesters.map((p) => ({ key: `s-${p.sequence}`, name: p.name, from: p.startsOn, to: p.endsOn })),
                      },
                      {
                        title: scopes.both ? `Congés · ${semesterScope}` : 'Congés',
                        items: official.technicalBreaks
                          .filter((b) => b.kind === 'VACATION')
                          .map((b) => ({ key: `ct-${b.name}`, name: b.name, from: b.startsOn, to: b.endsOn })),
                      },
                    ]
                  : []),
                {
                  title: 'Jours fériés',
                  items: official.breaks
                    .filter((b) => b.kind === 'PUBLIC_HOLIDAY')
                    .map((b) => ({ key: `f-${b.name}`, name: b.name, from: b.startsOn, to: b.endsOn })),
                },
              ].map((group) => (
                <div key={group.title} className="rounded-2xl border p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">{group.title}</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {group.items.map((it) => (
                      <li key={it.key}>
                        <span className="font-semibold">{it.name}</span>
                        <br />
                        <span className="text-[color:var(--muted-foreground)]">
                          {it.from === it.to ? `le ${formatDate(it.from)}` : `du ${formatDate(it.from)} au ${formatDate(it.to)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">{MOVABLE_HOLIDAYS_NOTE}</p>
            {officialApplied ? (
              <p className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
                Déjà appliqué : {scopes.both ? 'trimestres, semestres et congés sont à jour' : 'le découpage et les congés sont à jour'}.
              </p>
            ) : (
              <ConfirmSubmit
                action={applyOfficialCalendarAction.bind(null, slug, id)}
                label="Appliquer le calendrier officiel"
                confirmMessage={`Appliquer le calendrier officiel ${year.name} ? Les périodes de même rang et les congés de même nom recevront les dates officielles ; rien n’est supprimé.`}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'trimestres' || tab === 'semestres' ? (
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          {tab === 'semestres' ? `Semestres · ${semesterScope}` : 'Trimestres et périodes'}
        </h2>
        {tab === 'semestres' ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            L’enseignement technique et la formation professionnelle fonctionnent par semestres, avec leurs propres
            congés. Ils remplacent les trimestres pour les classes concernées ; le général garde les siens.
          </p>
        ) : null}
        {shownPeriods.length === 0 ? (
          <EmptyState
            title={tab === 'semestres' ? 'Aucun semestre' : 'Aucun trimestre'}
            hint={tab === 'semestres' ? 'Ajoutez les deux semestres, ou chargez le calendrier officiel.' : 'Ajoutez les trimestres de cette année, ou chargez le calendrier officiel.'}
          />
        ) : (
          <ul className="space-y-2">
            {shownPeriods.map((p) => {
              const phase = periodPhase(p.starts_on, p.ends_on, today);
              const weeks = Math.round(daysBetween(p.starts_on, p.ends_on) / 7);
              const PHASE = {
                current: { label: 'En cours', color: 'var(--color-success)' },
                upcoming: { label: 'À venir', color: 'var(--color-brand)' },
                past: { label: 'Terminé', color: 'var(--muted-foreground)' },
              }[phase];
              return (
              <li key={p.id}>
                <EditableItem
                  accent={phase === 'current' ? 'var(--color-success)' : 'var(--mod-c1, var(--color-brand))'}
                  header={
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-extrabold tracking-tight">{p.name}</h3>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ color: PHASE.color, backgroundColor: `color-mix(in oklch, ${PHASE.color} 14%, var(--surface))` }}
                        >
                          {PHASE.label}
                        </span>
                      </div>
                      <p className="text-base font-semibold">
                        Du {longDate(p.starts_on)} au {longDate(p.ends_on)}
                      </p>
                      <p className="text-sm text-[color:var(--muted-foreground)]">
                        {weeks} semaines · {PERIOD_KIND_LABEL[p.kind] ?? p.kind}
                        {periodScopeLabel(p.tracks) ? ` · ${periodScopeLabel(p.tracks)}` : ''}
                        {p.is_grading_period ? ' · période de notation (bulletin)' : ''}
                      </p>
                    </div>
                  }
                  actions={
                    canManage && editable ? (
                      <ConfirmSubmit
                        action={deletePeriodAction.bind(null, slug, id, p.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer la période « ${p.name} » ?`}
                      />
                    ) : null
                  }
                  editForm={
                    canManage && editable ? (
                      <PeriodEditForm
                        action={updatePeriodAction.bind(null, slug, id, p.id)}
                        defaults={{ name: p.name, kind: p.kind, startsOn: p.starts_on, endsOn: p.ends_on, isGradingPeriod: p.is_grading_period, track: formatTracks(p.tracks) }}
                        schoolTracks={tracks}
                        min={year.starts_on}
                        max={year.ends_on}
                        idPrefix={`period-${p.id}`}
                      />
                    ) : undefined
                  }
                  footer={
                    p.is_grading_period && windows?.get(p.id) ? (
                        <div className="space-y-3 border-t px-5 py-4" id={`calcul-${p.id}`}>
                          {(() => {
                            const w = windows.get(p.id)!;
                            const st = gradingState(w, today);
                            return (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium">Calcul des moyennes</span>
                                  <span
                                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                    style={{
                                      backgroundColor: st.open
                                        ? 'color-mix(in oklch, var(--color-success) 18%, var(--surface))'
                                        : st.source === 'none'
                                          ? 'color-mix(in oklch, var(--color-danger) 14%, var(--surface))'
                                          : 'var(--color-brand-muted)',
                                      color: st.open
                                        ? 'var(--color-success)'
                                        : st.source === 'none'
                                          ? 'var(--color-danger)'
                                          : 'var(--muted-foreground)',
                                    }}
                                  >
                                    {/* Jamais configuré n'est pas « fermé » : l'un est une
                                        décision, l'autre un oubli. */}
                                    {st.source === 'none' ? 'Non configuré' : st.open ? 'Ouvert' : 'Fermé'}
                                    {st.source === 'manual' ? ' (manuel)' : st.source === 'dates' ? ' (selon les dates)' : ''}
                                  </span>
                                </div>
                                <p className="text-xs text-[color:var(--muted-foreground)]">
                                  {st.source === 'none'
                                    ? 'Aucune date n’est encore fixée : tant qu’elle reste vide, aucun enseignant ne peut marquer ses moyennes « terminées » pour cette période. Les moyennes, elles, se calculent en permanence — ce réglage ne les bloque pas.'
                                    : 'Les enseignants marquent leurs moyennes « terminées » pendant cette période ; elle se ferme automatiquement à la date de fin. Vous pouvez l’ouvrir ou la fermer à tout moment.'}
                                </p>
                                {canManage && editable ? (
                                  <>
                                    <GradingWindowForm
                                      action={setGradingWindowAction.bind(null, slug, id, p.id)}
                                      defaultStarts={w.grading_starts_on}
                                      defaultEnds={w.grading_ends_on}
                                      min={p.starts_on}
                                      max={p.ends_on}
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      {st.open ? (
                                        <SimpleSubmit small action={setGradingOverrideAction.bind(null, slug, p.id, 'CLOSED', id)} label="Fermer maintenant" />
                                      ) : (
                                        <SimpleSubmit small action={setGradingOverrideAction.bind(null, slug, p.id, 'OPEN', id)} label="Ouvrir maintenant" />
                                      )}
                                      {w.grading_override ? (
                                        <SimpleSubmit small action={setGradingOverrideAction.bind(null, slug, p.id, 'AUTO', id)} label="Revenir au mode automatique" />
                                      ) : null}
                                    </div>
                                  </>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      ) : null
                  }
                />
              </li>
              );
            })}
          </ul>
        )}

        {canManage && editable ? (
          <PeriodCreateForm
            action={createPeriodAction.bind(null, slug, id)}
            nextSequence={nextSeqShown}
            schoolTracks={tracks}
            {...(tab === 'semestres'
              ? {
                  defaultKind: 'SEMESTER' as const,
                  defaultTrack: semesterTracks.filter((t) => tracks.includes(t)).join('+'),
                  title: 'Ajouter un semestre',
                }
              : { title: 'Ajouter un trimestre' })}
          />
        ) : null}
      </section>
      ) : null}

      {tab === 'conges' ? (
      <section className="space-y-3" id="calendrier">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Congés et jours fériés
          </h2>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Aucun cours n’est prévu ces jours-là : l’emploi du temps les saute et aucun appel n’est attendu.
          </p>
        </div>
        {events.length === 0 ? (
          <EmptyState title="Aucun congé saisi" hint="Appliquez le calendrier officiel, ou ajoutez vos congés et jours fériés." />
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const days = daysBetween(e.starts_on, e.ends_on);
              const holiday = e.kind === 'PUBLIC_HOLIDAY';
              return (
              <li key={e.id}>
                <EditableItem
                  accent={holiday ? 'var(--color-warning)' : 'var(--color-danger)'}
                  header={
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold tracking-tight">{e.name}</h3>
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                          {CALENDAR_KIND_LABEL[e.kind] ?? e.kind}
                        </span>
                      </div>
                      <p className="text-sm font-semibold">
                        {e.starts_on === e.ends_on ? `Le ${longDate(e.starts_on)}` : `Du ${longDate(e.starts_on)} au ${longDate(e.ends_on)}`}
                      </p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {days} jour{days > 1 ? 's' : ''}
                        {e.blocks_schedule ? ' · pas de cours' : ' · cours maintenus'}
                        {periodScopeLabel(e.tracks) ? ` · ${periodScopeLabel(e.tracks)}` : ''}
                      </p>
                    </div>
                  }
                  actions={
                    canManage && editable ? (
                      <ConfirmSubmit
                        action={deleteCalendarEventAction.bind(null, slug, id, e.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer « ${e.name} » ? Les cours prévus ces jours-là seront rétablis.`}
                      />
                    ) : null
                  }
                  editForm={
                    canManage && editable ? (
                      <CalendarEventForm
                        action={updateCalendarEventAction.bind(null, slug, id, e.id)}
                        defaults={{ name: e.name, kind: e.kind, startsOn: e.starts_on, endsOn: e.ends_on, blocksSchedule: e.blocks_schedule, track: formatTracks(e.tracks) }}
                        min={year.starts_on}
                        max={year.ends_on}
                        idPrefix={`event-${e.id}`}
                        schoolTracks={tracks}
                      />
                    ) : undefined
                  }
                />
              </li>
              );
            })}
          </ul>
        )}
        {canManage && editable ? (
          <CalendarEventForm
            action={createCalendarEventAction.bind(null, slug, id)}
            min={year.starts_on}
            max={year.ends_on}
            schoolTracks={tracks}
          />
        ) : null}
      </section>
      ) : null}

      {tab === 'horaires' && canManageHours && editable ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Jours et horaires
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Jours d&apos;ouverture de cette année, horaire de chacun et récréations — utilisés pour construire
              l&apos;emploi du temps.
            </p>
          </div>

          {/* Chaque cycle a sa grille : celle de l'établissement ne s'applique alors
              à aucune classe — inutile de l'afficher (elle reste modifiable ci-dessous). */}
          {dayHours.length > 0 || cycles.some((c) => c.grid) ? (
            <Card>
              <CardContent className="space-y-3 py-4">
                {dayHours.length > 0 && !allCyclesOwnGrid ? (
                  <GridSummary dayHours={dayHours} breaks={breaks} scope="tout l’établissement, sauf cycle réglé à part" />
                ) : null}

                {/* Une grille de cycle prime sur celle de l'établissement pour ses classes :
                    elle doit se voir ici aussi, pas seulement plus bas. */}
                {cycles
                  .filter((c) => c.grid)
                  .map((c, i) => (
                    <div key={c.id} className={i === 0 && allCyclesOwnGrid ? '' : 'border-t pt-3'}>
                      <GridSummary dayHours={c.grid!.dayHours} breaks={c.grid!.breaks} scope={`« ${c.name} » — toutes ses classes`} />
                    </div>
                  ))}

                {allCyclesOwnGrid ? (
                  <p className="border-t pt-3 text-xs text-[color:var(--muted-foreground)]">
                    Chaque cycle a sa propre grille : celle de l’établissement, réglable ci-dessous, ne s’applique
                    aujourd’hui à aucune classe. Elle resservirait si un cycle perdait la sienne.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <ConfigForm action={saveConfigAction.bind(null, slug, id, null)} defaults={hoursDefaults} />

          {cycles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Horaires par cycle (optionnel)</p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                Tout le monde ne sort pas à la même heure&nbsp;: le premier et le second cycle ont rarement la même
                récréation, et un établissement qui pratique plusieurs ordres d’enseignement en a encore d’autres.
                Donnez à ce cycle sa propre grille — horaires des journées <em>et</em> récréations — elle prime alors
                sur celle de l’établissement pour toutes ses classes.
              </p>
              <ul className="space-y-2">
                {cycles.map((c) => (
                  <li key={c.id} className="rounded-[--radius-card] border px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{c.name}</span>
                      <Link href={`/e/${slug}/academic-years/${id}/hours/${c.id}`} className="text-sm text-[color:var(--color-brand)] hover:underline">
                        {c.configId ? 'Modifier sa grille' : 'Configurer une grille propre'}
                      </Link>
                    </div>
                    <div className="mt-1.5">
                      {c.grid ? (
                        <GridSummary dayHours={c.grid.dayHours} breaks={c.grid.breaks} scope={`propre à « ${c.name} »`} compact />
                      ) : (
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                          Utilise la grille de l’établissement ci-dessus (mêmes horaires, mêmes récréations).
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'horaires' && !canManageHours ? (
        <Alert tone="info">Vous n’avez pas le droit de régler les horaires de l’établissement.</Alert>
      ) : null}
      {tab === 'infos' && !(canManage && editable) ? (
        <Alert tone="info">
          {editable ? 'Vous n’avez pas le droit de modifier cette année.' : 'Cette année est clôturée : ses informations ne se modifient plus.'}
        </Alert>
      ) : null}
    </div>
  );
}
