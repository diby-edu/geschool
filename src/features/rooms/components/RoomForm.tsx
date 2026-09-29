'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { EducationTrack } from '../suggestions';

const TRACK_LABEL: Record<EducationTrack, string> = {
  GENERAL: 'Enseignement général',
  TECHNIQUE: 'Enseignement technique',
  PROFESSIONNEL: 'Formation professionnelle',
};

type Values = Partial<Record<'code' | 'name' | 'roomTypeId' | 'capacity' | 'building' | 'floor', string>>;

export function RoomForm({
  action,
  roomTypes,
  defaultValues = {},
  submitLabel,
  defaultActive = true,
  features = [],
  selectedFeatures = [],
  schoolTracks = [],
  defaultTracks = [],
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roomTypes: { id: string; name: string }[];
  defaultValues?: Values;
  submitLabel: string;
  defaultActive?: boolean;
  /** Ordres de l'établissement : rien d'autre n'est proposé. */
  schoolTracks?: EducationTrack[];
  /** Ordres actuellement servis par la salle. */
  defaultTracks?: EducationTrack[];
  /** Équipements déclarés par l'école, à cocher pour cette salle. */
  features?: { id: string; name: string }[];
  selectedFeatures?: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};
  const active = state.values ? state.values.isActive != null : defaultActive;
  const [tracks, setTracks] = useState<EducationTrack[]>(
    defaultTracks.length > 0 ? defaultTracks : schoolTracks,
  );

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Ex. S12">
              <Input id="code" name="code" defaultValue={v.code} required autoFocus />
            </Field>
            <Field label="Capacité" htmlFor="capacity" required errors={err.capacity}>
              <Input id="capacity" name="capacity" type="number" min="0" defaultValue={v.capacity ?? '30'} required />
            </Field>
          </div>

          <Field label="Nom" htmlFor="name" required errors={err.name}>
            <Input id="name" name="name" defaultValue={v.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type de salle" htmlFor="roomTypeId" errors={err.roomTypeId}>
              <Select id="roomTypeId" name="roomTypeId" defaultValue={v.roomTypeId ?? ''}>
                {roomTypes.length === 0 ? <option value="">Aucun type créé</option> : null}
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batiment" htmlFor="building" errors={err.building}>
              <Input id="building" name="building" defaultValue={v.building} />
            </Field>
          </div>

          <Field label="Etage" htmlFor="floor" errors={err.floor}>
            <Input id="floor" name="floor" defaultValue={v.floor} />
          </Field>

          {schoolTracks.length > 1 ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Ordres d’enseignement servis</legend>
              <input type="hidden" name="tracks" value={tracks.join(',')} />
              <div className="grid gap-2 sm:grid-cols-3">
                {schoolTracks.map((t) => (
                  <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tracks.includes(t)}
                      onChange={() =>
                        setTracks((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                      }
                      className="size-4"
                    />
                    {TRACK_LABEL[t]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <input type="hidden" name="tracks" value={schoolTracks.join(',')} />
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={active} className="size-4" />
              Salle active
            </label>
          </div>

          <div className="pt-2">
            {features.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Équipements présents</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {features.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="features"
                      value={f.id}
                      defaultChecked={selectedFeatures.includes(f.id)}
                      className="size-4"
                    />
                    {f.name}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                Un cours peut exiger un équipement : seules les salles qui l’ont seront proposées.
              </p>
            </fieldset>
          ) : null}

          <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
