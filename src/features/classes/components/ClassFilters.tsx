'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

/**
 * Filtres de la liste des classes : l'ordre d'enseignement, puis le niveau.
 *
 * Des menus, pas des pastilles : une école technique peut avoir cinquante
 * niveaux, qui rempliraient trois lignes d'écran. Choisir un ordre restreint
 * aussitôt la liste des niveaux — on ne propose que ce qui existe dans cet
 * ordre.
 */
export function ClassFilters({
  basePath,
  track,
  levelId,
  tracks,
  levels,
  keep,
}: {
  basePath: string;
  track: string;
  levelId: string;
  /** Ordres de l'établissement ; le menu disparaît s'il n'y en a qu'un. */
  tracks: { value: string; label: string }[];
  /** Niveaux disponibles, déjà restreints à l'ordre choisi. */
  levels: { id: string; name: string }[];
  /** Ce qu'il faut conserver dans l'adresse (onglet, recherche, tri). */
  keep: Record<string, string>;
}) {
  const router = useRouter();

  const go = (next: Record<string, string>) => {
    const params = new URLSearchParams({ ...keep, ...next });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {tracks.length > 1 ? (
        <label className="text-sm">
          <span className="mb-1 block font-medium">Ordre d’enseignement</span>
          <Select
            value={track}
            onChange={(e) => go({ ordre: e.target.value, niveau: '', page: '' })}
            aria-label="Filtrer par ordre d’enseignement"
          >
            <option value="">Tous les ordres</option>
            {tracks.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      <label className="text-sm">
        <span className="mb-1 block font-medium">Niveau</span>
        <Select value={levelId} onChange={(e) => go({ niveau: e.target.value, page: '' })} aria-label="Filtrer par niveau">
          <option value="">
            {levels.length > 0 ? `Tous les niveaux (${levels.length})` : 'Aucun niveau'}
          </option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </label>

      {track || levelId ? (
        <button
          type="button"
          onClick={() => go({ ordre: '', niveau: '', page: '' })}
          className="h-10 cursor-pointer rounded-[--radius-card] border px-3 text-sm font-semibold"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          Tout afficher
        </button>
      ) : null}
    </div>
  );
}
