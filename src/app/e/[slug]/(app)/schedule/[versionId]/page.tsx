import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { getVersion, validationRequired } from '@/features/schedule/versions';
import { getConfig, getConfigForClass, listSlots, listPauses, getDayHours, getBreaks } from '@/features/schedule/config';
import { GridSummary } from '@/features/schedule/components/GridSummary';
import { listSessionsWithValidator } from '@/features/schedule/sessions';
import { listYearClasses, listActiveSubjects } from '@/features/assignments/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { detectConflicts } from '@/lib/schedule/validator';
import { loadGroupContextFor } from '@/features/schedule/group-context';
import {
  addSessionAction,
  deleteSessionAction,
  publishVersionAction,
  validateVersionAction,
  reopenVersionAction,
  toggleSessionLockAction,
} from '@/features/schedule/actions';
import { AddSessionForm } from '@/features/schedule/components/AddSessionForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ClassPicker } from '@/features/schedule/components/ClassPicker';
import { ValidationPanel } from '@/features/schedule/components/ValidationPanel';

const ETAT_VERSION: Record<string, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: 'Vérifié, prêt à publier',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
};

export const metadata: Metadata = { title: 'Editeur emploi du temps' };

const DAY_LABEL: Record<number, string> = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };
const DAY_ABBR: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim' };
const hm = (t: string) => t.slice(0, 5);

export default async function ScheduleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; versionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, versionId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.view');
  requireFeature(ctx, 'schedule');

  const version = await getVersion(ctx, versionId);
  if (!version) notFound();

  // Deux vagues de lectures en parallèle (avant : neuf lectures l'une après
  // l'autre, ~4 s de plus sur un établissement de 2 000 cours).
  const supabase = await createClient();
  const [{ rows: sessions, validator: validatorSessions }, classes, subjects, teachers, { data: roomsData }, etapeExigee] = await Promise.all([
    listSessionsWithValidator(ctx, versionId),
    listYearClasses(ctx, version.academic_year_id),
    listActiveSubjects(ctx),
    listActiveTeachers(ctx),
    // Salles
    supabase.from('rooms').select('id, code, name').eq('school_id', ctx.school.id).eq('is_active', true).order('code'),
    // On ne publie que ce qui a été vérifié — sauf si l'école a retiré l'étape.
    validationRequired(ctx),
  ]);
  const rooms = (roomsData ?? []).map((r) => ({ id: r.id, name: `${r.code} — ${r.name}` }));

  const selectedClassId = (Array.isArray(sp.class) ? sp.class[0] : sp.class) ?? classes[0]?.id ?? null;
  const [{ config, slots, pauses, gridDayHours, gridBreaks }, groupContext] = await Promise.all([
    (async () => {
      // Grille de la classe affichee : sa grille de cycle si son cycle en a une
      // (recreation propre, horaires propres…), sinon la grille par defaut de
      // l'annee — jamais un melange des deux dans le meme ecran.
      const config = selectedClassId
        ? await getConfigForClass(ctx, version.academic_year_id, selectedClassId)
        : await getConfig(ctx, version.academic_year_id);
      // Pauses de CETTE grille (récréations, déjeuner) : elles apparaissent dans les
      // colonnes, pour qu'on voie tout de suite l'horaire réel d'une journée.
      const [slots, pauses, gridDayHours, gridBreaks] = config
        ? await Promise.all([listSlots(ctx, config.id), listPauses(ctx, config.id), getDayHours(ctx, config.id), getBreaks(ctx, config.id)])
        : [[], [], [], []];
      return { config, slots, pauses, gridDayHours, gridBreaks };
    })(),
    loadGroupContextFor(ctx, validatorSessions),
  ]);
  const gridScope = config?.cycle_id ? 'grille propre à ce cycle' : 'grille de l’établissement';

  const conflicts = detectConflicts(validatorSessions, groupContext);
  const workingDays = (config?.working_days as number[] | undefined) ?? [];
  const selectedClass = selectedClassId;
  const editable = version.status === 'DRAFT' || version.status === 'VALIDATED';
  // L'emploi du temps publié se modifie aussi (changer un créneau en cours
  // d'année), par qui a le droit de le modifier : le changement est immédiat.
  const isPublished = version.status === 'PUBLISHED';
  const canEdit = hasPermission(ctx, 'schedule.create') && (editable || isPublished);
  // Figer une séance reste possible sur une version publiée : c'est même là
  // que l'école le fait, juste avant de relancer une génération.
  const canLock = hasPermission(ctx, 'schedule.lock');
  const verifie = version.status === 'VALIDATED' || !etapeExigee;
  const canPublish = hasPermission(ctx, 'schedule.publish') && editable && verifie;
  const canValidate = hasPermission(ctx, 'schedule.validate') && editable;

  const slotOptions = slots.map((s) => ({ id: s.id, label: `${DAY_ABBR[s.day_of_week]} ${hm(s.starts_at)}–${hm(s.ends_at)}` }));
  const classSessions = selectedClass ? sessions.filter((s) => s.class_id === selectedClass) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash searchParams={sp} />
      {sp.published === '1' ? <Alert tone="success">Emploi du temps publié. Les occurrences ont été générées.</Alert> : null}
      {sp.validee === '1' ? <Alert tone="success">Version vérifiée. Elle peut maintenant être publiée.</Alert> : null}
      {sp.rouverte === '1' ? <Alert tone="info">Version rouverte : elle est de nouveau modifiable.</Alert> : null}

      <PageHeader
        title={version.name}
        description={`${ETAT_VERSION[version.status] ?? version.status} · ${sessions.length} cours`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/e/${slug}/schedule`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
              Retour
            </Link>
            {canPublish ? (
              <ConfirmSubmit
                action={publishVersionAction.bind(null, slug, versionId)}
                label="Publier"
                variant="secondary"
                confirmMessage="Publier cet emploi du temps ? Il remplacera la version publiée et generera les occurrences."
              />
            ) : null}
          </div>
        }
      />

      {etapeExigee ? (
        <ValidationPanel
          validate={validateVersionAction.bind(null, slug, versionId)}
          reopen={reopenVersionAction.bind(null, slug, versionId)}
          status={version.status}
          validatedAt={version.validated_at}
          note={version.validation_note}
          canValidate={canValidate}
        />
      ) : null}

      {isPublished && canEdit ? (
        <Alert tone="info">
          Emploi du temps en service. Vous pouvez déplacer, ajouter ou retirer un cours : le changement s&apos;applique
          dès maintenant, pour les enseignants, les élèves et l&apos;appel. Les cours déjà passés et leurs appels ne
          changent pas.
        </Alert>
      ) : null}

      {version.status === 'DRAFT' && version.source === 'GENERATED' && hasPermission(ctx, 'schedule.generate') ? (
        <Alert tone="info">
          Généré automatiquement. Si l&apos;établissement a plusieurs cycles avec leur propre grille, vous pouvez{' '}
          <Link href={`/e/${slug}/schedule/generate?version=${versionId}`} className="font-medium underline">
            générer un autre cycle dans cette même version
          </Link>{' '}
          avant de publier.
        </Alert>
      ) : null}

      {conflicts.length > 0 ? (
        <Card>
          <CardContent>
            <p className="mb-2 text-sm font-medium text-[color:var(--color-danger)]">
              {conflicts.length} conflit(s) a resoudre avant publication
            </p>
            <ul className="space-y-1 text-sm text-[color:var(--muted-foreground)]">
              {conflicts.slice(0, 8).map((c, i) => (
                <li key={i}>• {c.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : sessions.length > 0 ? (
        <Alert tone="success">
          {isPublished ? 'Aucun conflit.' : 'Aucun conflit. L’emploi du temps peut être publié.'}
        </Alert>
      ) : null}

      {classes.length > 1 ? (
        <ClassPicker basePath={`/e/${slug}/schedule/${versionId}`} classes={classes} selected={selectedClass} />
      ) : null}

      {gridDayHours.length > 0 ? (
        <Card>
          <CardContent className="py-3">
            <GridSummary dayHours={gridDayHours} breaks={gridBreaks} scope={gridScope} compact />
          </CardContent>
        </Card>
      ) : null}

      {/* Grille : une colonne par jour ouvre */}
      {workingDays.length === 0 ? (
        <EmptyState title="Grille non configurée" />
      ) : (
        // Sur téléphone, la semaine défile dans sa zone : sans largeur minimale par
        // jour, les cours et leurs boutons débordaient de la page (vu le 2026-10-25).
        <div className="overflow-x-auto">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${workingDays.length}, minmax(0, 1fr))`, minWidth: `${workingDays.length * 9}rem` }}
          >
          {workingDays.map((day) => {
            const daySessions = classSessions
              .filter((s) => s.day_of_week === day)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const dayPauses = pauses.filter((p) => p.day === day);
            // Cours et pauses dans l'ordre de la journée.
            const dayItems = [
              ...daySessions.map((s) => ({ start: s.starts_at.slice(0, 5), session: s, pause: null as (typeof pauses)[number] | null })),
              ...dayPauses.map((p) => ({ start: p.start, session: null as (typeof daySessions)[number] | null, pause: p })),
            ].sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={day} className="rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
                <p className="border-b px-2 py-1.5 text-center text-xs font-medium">{DAY_LABEL[day]}</p>
                <div className="space-y-1 p-1.5">
                  {daySessions.length === 0 && dayPauses.length === 0 ? (
                    <p className="py-2 text-center text-xs text-[color:var(--muted-foreground)]">—</p>
                  ) : (
                    dayItems.map((item) =>
                      item.pause ? (
                        <div
                          key={`p-${item.start}`}
                          className="rounded px-2 py-1 text-center text-[11px] font-semibold"
                          style={{
                            backgroundColor:
                              item.pause.kind === 'LUNCH'
                                ? 'color-mix(in oklch, var(--color-warning) 20%, var(--surface))'
                                : 'color-mix(in oklch, var(--foreground) 7%, var(--surface))',
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          {item.pause.label}
                          <br />
                          {item.pause.start}–{item.pause.end}
                        </div>
                      ) : (
                      <div key={item.session!.id} className="rounded border-l-2 border-[color:var(--color-brand)] bg-[color:var(--color-brand-muted)] px-2 py-1 text-xs">
                        <p className="font-medium">{item.session!.subject_name}</p>
                        <p className="text-[color:var(--muted-foreground)]">
                          {hm(item.session!.starts_at)}–{hm(item.session!.ends_at)}
                        </p>
                        {item.session!.teacher_name ? <p className="text-[color:var(--muted-foreground)]">{item.session!.teacher_name}</p> : null}
                        {item.session!.room_name ? <p className="text-[color:var(--muted-foreground)]">Salle {item.session!.room_name}</p> : null}
                        {item.session!.is_locked ? (
                          <p className="font-semibold" style={{ color: 'var(--color-brand)' }}>
                            🔒 figée
                          </p>
                        ) : null}
                        <div className="flex items-center gap-1">
                          {canLock ? (
                            <SimpleSubmit
                              action={toggleSessionLockAction.bind(
                                null,
                                slug,
                                versionId,
                                item.session!.id,
                                !item.session!.is_locked,
                              )}
                              label={item.session!.is_locked ? 'Libérer' : 'Figer'}
                              small
                            />
                          ) : null}
                          {canEdit ? (
                            <Link
                              href={`/e/${slug}/schedule/${versionId}/deplacer/${item.session!.id}`}
                              className="underline"
                            >
                              Déplacer
                            </Link>
                          ) : null}
                          {canEdit ? (
                            <ConfirmSubmit
                              action={deleteSessionAction.bind(null, slug, versionId, item.session!.id)}
                              label="×"
                              variant="secondary"
                              confirmMessage={`Retirer ${item.session!.subject_name} du ${DAY_LABEL[day]} ?`}
                            />
                          ) : null}
                        </div>
                      </div>
                      ),
                    )
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {canEdit && slotOptions.length > 0 && subjects.length > 0 && classes.length > 0 ? (
        <AddSessionForm
          action={addSessionAction.bind(null, slug, versionId)}
          slots={slotOptions}
          subjects={subjects}
          teachers={teachers}
          rooms={rooms}
          classes={classes}
          selectedClassId={selectedClass}
        />
      ) : null}
    </div>
  );
}
