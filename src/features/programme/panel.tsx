import { hasPermission } from '@/lib/permissions';
import type { TenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listLevels, schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS } from '@/features/structure/official-tracks';
import { listLevelSubjects } from '@/features/programme/queries';
import { saveLevelProgrammeAction, applyOfficialProgrammeAction } from '@/features/programme/actions';
import { sessionMinutesForLevel } from '@/features/programme/service';
import { OFFICIAL_CI_LEVELS, OFFICIAL_CI_SUBJECTS, OFFICIAL_CI_PROGRAMME } from '@/features/programme/official-ci';
import {
  LevelProgrammeForm,
  type ProgrammeCurrent,
} from '@/features/programme/components/LevelProgrammeForm';
import { LevelPicker, type LevelGroup } from '@/features/programme/components/LevelPicker';
import { EmptyState } from '@/components/layout/PageHeader';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

type Sp = Record<string, string | string[] | undefined>;

/** Bilan du chargement de la grille officielle, porté par l'URL (?official=niveaux-matières-coefficients). */
function officialSummary(raw: string | string[] | undefined): string | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
  if (!m) return null;
  const [levels, subjects, entries] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (levels + subjects + entries === 0) return 'La grille officielle était déjà chargée : rien à ajouter.';
  return `Grille officielle chargée : ${levels} niveau(x), ${subjects} matière(s) et ${entries} ligne(s) de programme — coefficients ET séances hebdomadaires. Tout reste modifiable ci-dessous.`;
}

/** Bilan de l'enregistrement du programme d'un niveau (?enregistre=ajoutées-modifiées-retirées). */
function savedSummary(raw: string | string[] | undefined): string | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
  if (!m) return null;
  const [added, changed, removed] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (added + changed + removed === 0) return 'Programme enregistré : rien n’avait changé.';
  const parts = [
    added > 0 ? `${added} matière(s) ajoutée(s)` : null,
    changed > 0 ? `${changed} modifiée(s)` : null,
    removed > 0 ? `${removed} retirée(s)` : null,
  ].filter(Boolean);
  return `Programme enregistré : ${parts.join(', ')}. Les coefficients, les volumes et les moyennes suivent.`;
}

/**
 * Programme d'un niveau : ses matières, leurs coefficients et leurs volumes
 * horaires. Le coefficient appartient au NIVEAU, pas à la matière : « Maths »
 * pèse 3 en 6ème et 5 en 1ère C. Écran partagé par l'onglet « Programme et
 * coefficients » de Matières et par la page Programme (espace Enseignant).
 */
export async function ProgrammePanel({
  ctx,
  slug,
  sp,
  basePath,
  keep = {},
}: {
  ctx: TenantContext;
  slug: string;
  sp: Sp;
  /** Page qui accueille le panneau (l'URL du sélecteur de niveau en dépend). */
  basePath: string;
  keep?: Record<string, string>;
}) {
  const [allLevels, tracks] = await Promise.all([listLevels(ctx), schoolTracks(ctx)]);
  // Un établissement qui n'a que le général ne voit ni les séries techniques ni
  // les diplômes professionnels, même si des niveaux existent en base.
  const levels = allLevels.filter((l) => tracks.includes(l.track));

  const canManage = hasPermission(ctx, 'subjects.update');

  const supabase = await createClient();
  const [{ data: subjectsData }, { data: pairsData }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, code, name, default_coefficient, tracks')
      .eq('school_id', ctx.school.id)
      .eq('is_active', true)
      .order('name'),
    supabase.from('level_subjects').select('level_id, subject_id').eq('school_id', ctx.school.id),
  ]);

  // Sans choix explicite, on ouvre sur un niveau QUI A déjà un programme, et
  // dans l'ordre habituel des ordres d'enseignement. Atterrir sur « 1 BEP
  // COMPTA » et lire « aucune matière » donne l'impression que l'écran est cassé,
  // alors que la grille officielle ne couvre que le général.
  const configured = new Set(((pairsData ?? []) as { level_id: string }[]).map((r) => r.level_id));
  const trackRank: Record<string, number> = { GENERAL: 0, TECHNIQUE: 1, PROFESSIONNEL: 2 };
  const byTrack = [...levels].sort((a, b) => (trackRank[a.track] ?? 9) - (trackRank[b.track] ?? 9));
  const asked = Array.isArray(sp.level) ? sp.level[0] : sp.level;
  const selectedLevel = asked ?? byTrack.find((l) => configured.has(l.id))?.id ?? byTrack[0]?.id ?? null;

  const level = levels.find((l) => l.id === selectedLevel) ?? null;
  // TOUTES les matières de l'ordre du niveau, au programme ou non : c'est la
  // liste qu'on coche. Une matière sans ordre déclaré vaut pour tous les ordres ;
  // une matière d'un autre ordre reste dehors — pas de « Fabrication mécanique »
  // dans une 6ème générale.
  const subjects = (subjectsData ?? [])
    .filter((s) => {
      const t = (s.tracks as string[] | null) ?? [];
      return !level || t.length === 0 || t.includes(level.track);
    })
    .map((s) => ({ id: s.id, code: s.code, name: s.name, defaultCoefficient: s.default_coefficient }));

  const rows = selectedLevel ? await listLevelSubjects(ctx, selectedLevel) : [];
  // Une séance dure ce que dure un créneau de ce cycle : c'est l'unité de saisie.
  const sessionMinutes = selectedLevel ? await sessionMinutesForLevel(ctx, selectedLevel) : 60;
  const current: ProgrammeCurrent = Object.fromEntries(
    rows.map((r) => [
      r.subject_id,
      { coefficient: Number(r.coefficient), weeklyMinutes: r.weekly_minutes, mandatory: r.is_mandatory },
    ]),
  );

  // Grille officielle ivoirienne (général) : proposée tant qu'un de ses niveaux ou de ses matières manque.
  const canLoadOfficial =
    tracks.includes('GENERAL') &&
    ['cycles.manage', 'levels.manage', 'subjects.create', 'subjects.update'].every((p) => hasPermission(ctx, p));
  const levelById = new Map(allLevels.map((l) => [l.id, l.code]));
  const levelCodes = new Set(allLevels.map((l) => l.code));
  const subjectById = new Map((subjectsData ?? []).map((s) => [s.id, s.code]));
  const subjectCodes = new Set((subjectsData ?? []).map((s) => s.code));

  // La grille est incomplète dès qu'il manque un niveau, une matière, OU une
  // ligne de programme. Le dernier cas arrive à une école qui avait chargé une
  // version antérieure de la grille : ses niveaux existent, mais pas toutes ses
  // matières au programme.
  const pairs = new Set(
    ((pairsData ?? []) as { level_id: string; subject_id: string }[])
      .map((r) => `${levelById.get(r.level_id) ?? ''}:${subjectById.get(r.subject_id) ?? ''}`),
  );
  const missingEntry = OFFICIAL_CI_LEVELS.some((l) =>
    Object.keys(OFFICIAL_CI_PROGRAMME[l.code] ?? {}).some((code) => !pairs.has(`${l.code}:${code}`)),
  );
  const officialIncomplete =
    OFFICIAL_CI_LEVELS.some((l) => !levelCodes.has(l.code)) ||
    OFFICIAL_CI_SUBJECTS.some((s) => !subjectCodes.has(s.code)) ||
    missingEntry;
  const summary = officialSummary(sp.official);
  const saved = savedSummary(sp.enregistre);

  // Où revenir après l'enregistrement : l'onglet d'où l'on vient, sur ce niveau.
  const returnTo = selectedLevel
    ? `${basePath}?${new URLSearchParams({ ...keep, level: selectedLevel }).toString()}`
    : basePath;

  // Groupes du sélecteur : un par ordre, et par diplôme dans le professionnel.
  const groups: LevelGroup[] = [];
  for (const l of levels) {
    const label = l.track === 'PROFESSIONNEL' ? `${TRACK_LABELS[l.track]} · ${l.diploma ?? 'Autres'}` : TRACK_LABELS[l.track];
    const found = groups.find((g) => g.label === label);
    if (found) found.levels.push({ id: l.id, name: l.name });
    else groups.push({ label, levels: [{ id: l.id, name: l.name }] });
  }

  return (
    <div className="space-y-5">
      {summary ? <Alert tone="success">{summary}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}

      {canLoadOfficial && officialIncomplete ? (
        <Card>
          <CardContent className="space-y-3 py-4 text-sm">
            <h2 className="font-semibold">Grille officielle : Côte d’Ivoire, secondaire général</h2>
            <p className="text-[color:var(--muted-foreground)]">
              Crée en un clic les niveaux de la 6ème à la Terminale (une série par niveau : 2nde A et C, 1ère et Terminale
              A1, A2, C, D), les matières et les coefficients officiels. Ce qui existe déjà n’est pas modifié, et tout reste
              modifiable ensuite.
            </p>
            <ConfirmSubmit
              action={applyOfficialProgrammeAction.bind(null, slug)}
              label="Charger la grille officielle"
              variant="secondary"
              confirmMessage="Créer les niveaux, matières et coefficients officiels manquants ? Ce qui existe déjà ne sera pas modifié."
            />
          </CardContent>
        </Card>
      ) : null}

      {levels.length === 0 ? (
        <EmptyState
          title="Aucun niveau"
          hint="Définissez d'abord des niveaux dans la structure pédagogique, ou chargez la grille officielle."
        />
      ) : (
        <>
          <LevelPicker basePath={basePath} groups={groups} selected={selectedLevel} keep={keep} />

          {level ? (
            <p className="text-xs text-[color:var(--muted-foreground)]">
              {TRACK_LABELS[level.track]}
              {level.diploma ? ` · diplôme ${level.diploma}` : ''} · le coefficient vaut pour ce niveau uniquement.
            </p>
          ) : null}

          {level && selectedLevel ? (
            <LevelProgrammeForm
              action={saveLevelProgrammeAction.bind(null, slug)}
              levelId={selectedLevel}
              levelName={level.name}
              returnTo={returnTo}
              subjects={subjects}
              current={current}
              canEdit={canManage}
              sessionMinutes={sessionMinutes}
            />
          ) : null}

        </>
      )}
    </div>
  );
}
