'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/input';

export type LevelGroup = { label: string; levels: { id: string; name: string }[] };

/**
 * Choix du niveau (?level dans l'URL), groupé par ordre d'enseignement et, pour
 * la formation professionnelle, par diplôme : une longue liste plate de
 * « 1 BT COMPTA », « 2 CAP PLOMB »… serait illisible.
 */
export function LevelPicker({
  basePath,
  groups,
  selected,
  keep = {},
}: {
  basePath: string;
  groups: LevelGroup[];
  selected: string | null;
  /** Paramètres d'URL à conserver (onglet en cours, par exemple). */
  keep?: Record<string, string>;
}) {
  const router = useRouter();
  const go = (id: string) => {
    const params = new URLSearchParams({ ...keep, level: id });
    router.replace(`${basePath}?${params.toString()}`);
  };

  return (
    <div className="max-w-sm">
      <Label htmlFor="level-picker">Niveau</Label>
      <Select id="level-picker" value={selected ?? ''} onChange={(e) => go(e.target.value)}>
        {groups.map((g) =>
          groups.length === 1 ? (
            g.levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))
          ) : (
            <optgroup key={g.label} label={g.label}>
              {g.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </Select>
    </div>
  );
}
