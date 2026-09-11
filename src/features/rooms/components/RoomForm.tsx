'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Values = Partial<Record<'code' | 'name' | 'roomTypeId' | 'capacity' | 'building' | 'floor', string>>;

export function RoomForm({
  action,
  roomTypes,
  defaultValues = {},
  submitLabel,
  defaultActive = true,
  defaultAccessible = true,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roomTypes: { id: string; name: string }[];
  defaultValues?: Values;
  submitLabel: string;
  defaultActive?: boolean;
  defaultAccessible?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};
  const active = state.values ? state.values.isActive != null : defaultActive;
  const accessible = state.values ? state.values.isAccessible != null : defaultAccessible;

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Ex. S12">
              <Input id="code" name="code" defaultValue={v.code} required autoFocus />
            </Field>
            <Field label="Capacite" htmlFor="capacity" required errors={err.capacity}>
              <Input id="capacity" name="capacity" type="number" min="0" defaultValue={v.capacity ?? '30'} required />
            </Field>
          </div>

          <Field label="Nom" htmlFor="name" required errors={err.name}>
            <Input id="name" name="name" defaultValue={v.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type de salle" htmlFor="roomTypeId" errors={err.roomTypeId}>
              <Select id="roomTypeId" name="roomTypeId" defaultValue={v.roomTypeId ?? ''}>
                <option value="">— Aucun —</option>
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isAccessible" defaultChecked={accessible} className="size-4" />
              Accessible (PMR)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={active} className="size-4" />
              Salle active
            </label>
          </div>

          <div className="pt-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
