import { EmptyState } from '@/components/layout/PageHeader';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { LevelCard } from './LevelCard';
import type { LevelProgress } from '../board';

/**
 * Où en est le programme, niveau par niveau.
 *
 * Avant, il fallait ouvrir chaque niveau pour savoir s'il était configuré. Ici
 * tout se lit d'un coup : combien de matières, quel coefficient total, combien
 * de classes — et ce qui manque est dit en rouge, pas deviné. Chaque carte se
 * déplie sur le détail des matières.
 */
export function LevelProgressList({
  basePath,
  levels,
  tracks,
}: {
  basePath: string;
  levels: LevelProgress[];
  /** Ordres de l'établissement : on n'affiche pas les niveaux d'un ordre absent. */
  tracks: string[];
}) {
  const shown = levels.filter((l) => tracks.length === 0 || tracks.includes(l.track));
  const configured = shown.filter((l) => l.subjects > 0).length;

  if (shown.length === 0) {
    return (
      <EmptyState
        title="Aucun niveau"
        hint="Créez vos niveaux dans Structure pédagogique, ou chargez ceux de votre ordre d’enseignement."
      />
    );
  }

  const groups = (['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'] as EducationTrack[])
    .map((t) => ({ track: t, rows: shown.filter((l) => l.track === t) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--muted-foreground)]">
        <span className="font-semibold text-[color:var(--foreground)]">
          {configured} / {shown.length}
        </span>{' '}
        niveau{shown.length > 1 ? 'x' : ''} configuré{configured > 1 ? 's' : ''}.
      </p>

      {groups.map((g) => (
        <section key={g.track} className="space-y-2">
          {groups.length > 1 ? (
            <h3 className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              {TRACK_LABELS[g.track]}
            </h3>
          ) : null}

          {g.rows.map((l) => (
            <LevelCard key={l.levelId} level={l} href={`${basePath}?onglet=programme&level=${l.levelId}`} />
          ))}
        </section>
      ))}
    </div>
  );
}
