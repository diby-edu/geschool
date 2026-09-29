'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import type { GridLevel } from '../grid';

const TRACK_LABEL: Record<string, string> = {
  GENERAL: 'Enseignement général',
  TECHNIQUE: 'Enseignement technique',
  PROFESSIONNEL: 'Formation professionnelle',
};

/**
 * Le choix du niveau, groupé par ordre d'enseignement et dans l'ordre de
 * l'école — général d'abord, puis technique et professionnel, jamais mélangés.
 * Les niveaux sans classe sont dits comme tels : inutile d'ouvrir une grille
 * vide pour s'en apercevoir.
 */
export function LevelChooser({
  basePath,
  levels,
  selected,
}: {
  basePath: string;
  levels: GridLevel[];
  selected: string;
}) {
  const router = useRouter();

  const groups: { track: string; rows: GridLevel[] }[] = [];
  for (const l of levels) {
    const last = groups[groups.length - 1];
    if (last && last.track === l.track) last.rows.push(l);
    else groups.push({ track: l.track, rows: [l] });
  }

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Niveau</span>
      <Select
        value={selected}
        onChange={(e) => router.push(e.target.value ? `${basePath}?niveau=${e.target.value}` : basePath)}
        aria-label="Choisir le niveau à affecter"
      >
        <option value="">— Choisir un niveau —</option>
        {groups.map((g) => (
          <optgroup key={g.track} label={TRACK_LABEL[g.track] ?? g.track}>
            {g.rows.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.classes > 0 ? ` (${l.classes} classe${l.classes > 1 ? 's' : ''})` : ' — aucune classe'}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </label>
  );
}
