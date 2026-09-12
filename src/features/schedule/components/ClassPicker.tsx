'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/input';

/** Selecteur de classe : change le parametre ?class de l'URL. */
export function ClassPicker({
  basePath,
  classes,
  selected,
}: {
  basePath: string;
  classes: { id: string; name: string }[];
  selected: string | null;
}) {
  const router = useRouter();
  return (
    <div className="max-w-xs">
      <Label htmlFor="class-picker">Classe affichee</Label>
      <Select
        id="class-picker"
        value={selected ?? ''}
        onChange={(e) => router.replace(`${basePath}?class=${e.target.value}`)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
