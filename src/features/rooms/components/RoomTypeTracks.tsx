'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/lib/forms';
import type { EducationTrack } from '../suggestions';

const TRACK_LABEL: Record<EducationTrack, string> = {
  GENERAL: 'Général',
  TECHNIQUE: 'Technique',
  PROFESSIONNEL: 'Professionnel',
};

/**
 * Les ordres d'enseignement d'un type de salle, modifiables sur place.
 *
 * Le bouton n'apparaît qu'une fois quelque chose changé : sur une liste de
 * vingt types, vingt boutons « Enregistrer » permanents ne servent à rien.
 *
 * Restreindre un type ne touche pas aux salles déjà créées — il ne fait que
 * proposer un défaut aux suivantes, et disparaître des listes des ordres qu'il
 * ne sert plus.
 */
export function RoomTypeTracks({
  action,
  current,
  schoolTracks,
  readOnly,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  current: EducationTrack[];
  schoolTracks: EducationTrack[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [picked, setPicked] = useState<EducationTrack[]>(current);

  const same =
    picked.length === current.length && picked.every((t) => current.includes(t));

  // Un établissement mono-ordre n'a rien à arbitrer.
  if (schoolTracks.length < 2) return null;

  if (readOnly) {
    return (
      <p className="text-xs text-[color:var(--muted-foreground)]">
        {current.map((t) => TRACK_LABEL[t]).join(' · ')}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {schoolTracks.map((t) => (
        <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="tracks"
            value={t}
            checked={picked.includes(t)}
            onChange={() =>
              setPicked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
            }
            className="size-3.5"
          />
          {TRACK_LABEL[t]}
        </label>
      ))}
      {!same ? (
        <SubmitButton size="sm" variant="secondary">
          Enregistrer
        </SubmitButton>
      ) : null}
      {picked.length === 0 && !same ? (
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Aucun ordre coché : tous seront rétablis.
        </span>
      ) : null}
    </form>
  );
}
