'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { EducationTrack, TypeSuggestion } from '../suggestions';

export type ExistingType = { id: string; name: string; tracks: EducationTrack[] };

/** Ce que le formulaire retient du type choisi. */
export type TypeChoice = {
  /** Type déjà créé par l'école. */
  id: string;
  /** Type à créer au moment de l'enregistrement (suggestion ou saisie libre). */
  newName: string;
  tracks: EducationTrack[];
};

/**
 * Le type d'une salle, en une seule liste.
 *
 * Avant, il fallait choisir dans une liste déroulante qui ne contenait que les
 * types DÉJÀ créés — soit une seule ligne pour une école qui débute — puis
 * cliquer une pastille en dessous pour en créer un autre. Ici tout est au même
 * endroit, avec une recherche : d'abord les types de l'école, puis les types
 * courants qu'elle n'a pas encore. Choisir un type courant le crée au moment de
 * l'enregistrement.
 *
 * On ne propose jamais un type d'un ordre d'enseignement que l'établissement
 * n'a pas : pas d'atelier mécanique dans un lycée général.
 */
export function RoomTypeSelect({
  types,
  suggestions,
  value,
  onChange,
}: {
  types: ExistingType[];
  suggestions: TypeSuggestion[];
  value: TypeChoice;
  onChange: (choice: TypeChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    field.current?.focus();
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const match = (name: string) => fold(name).includes(fold(query.trim()));

  const mine = types.filter((t) => match(t.name));
  // Un type que l'école a déjà créé n'a pas à réapparaître dans les suggestions.
  const taken = new Set(types.map((t) => fold(t.name)));
  const rest = suggestions.filter((s) => !taken.has(fold(s.name)) && match(s.name));

  const label =
    value.newName ||
    types.find((t) => t.id === value.id)?.name ||
    'Choisir un type';

  const pick = (choice: TypeChoice) => {
    onChange(choice);
    setOpen(false);
    setQuery('');
  };

  const free = query.trim();
  const canCreateFree =
    free.length > 1 && !mine.some((t) => fold(t.name) === fold(free)) && !rest.some((s) => fold(s.name) === fold(free));

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="roomTypeId" value={value.id} />
      <input type="hidden" name="newTypeName" value={value.newName} />
      <input type="hidden" name="newTypeTracks" value={value.tracks.join(',')} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-[color:var(--muted-foreground)]" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border shadow-lg"
          style={{ backgroundColor: 'var(--surface)' }}
          role="listbox"
        >
          <div className="sticky top-0 flex items-center gap-2 border-b px-3 py-2" style={{ backgroundColor: 'var(--surface)' }}>
            <Search className="size-4 shrink-0 text-[color:var(--muted-foreground)]" aria-hidden />
            <input
              ref={field}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un type…"
              aria-label="Rechercher un type de salle"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          {mine.length > 0 ? (
            <Group title="Vos types">
              {mine.map((t) => (
                <Option
                  key={t.id}
                  label={t.name}
                  selected={value.id === t.id}
                  onClick={() => pick({ id: t.id, newName: '', tracks: t.tracks })}
                />
              ))}
            </Group>
          ) : null}

          {rest.length > 0 ? (
            <Group title="Suggestions">
              {rest.map((s) => (
                <Option
                  key={s.code}
                  label={s.name}
                  selected={value.newName === s.name}
                  onClick={() => pick({ id: '', newName: s.name, tracks: s.tracks })}
                />
              ))}
            </Group>
          ) : null}

          {canCreateFree ? (
            <Group title="Créer">
              <Option
                label={`Créer « ${free} »`}
                selected={false}
                onClick={() => pick({ id: '', newName: free, tracks: [] })}
              />
            </Group>
          ) : null}

          {mine.length === 0 && rest.length === 0 && !canCreateFree ? (
            <p className="px-3 py-4 text-sm text-[color:var(--muted-foreground)]">Aucun type ne correspond.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b last:border-0">
      <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
        {title}
      </p>
      <ul className="py-1">{children}</ul>
    </div>
  );
}

function Option({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        role="option"
        aria-selected={selected}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[color:var(--color-brand-muted)]"
      >
        <span className="truncate">{label}</span>
        {selected ? <Check className="size-4 shrink-0" style={{ color: 'var(--color-brand)' }} aria-hidden /> : null}
      </button>
    </li>
  );
}
