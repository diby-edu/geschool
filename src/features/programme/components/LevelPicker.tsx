'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/input';

/** Selecteur de niveau : change le parametre ?level de l'URL. */
export function LevelPicker({
  basePath,
  levels,
  selected,
}: {
  basePath: string;
  levels: { id: string; name: string }[];
  selected: string | null;
}) {
  const router = useRouter();
  return (
    <div className="max-w-xs">
      <Label htmlFor="level-picker">Niveau</Label>
      <Select
        id="level-picker"
        value={selected ?? ''}
        onChange={(e) => router.replace(`${basePath}?level=${e.target.value}`)}
      >
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
