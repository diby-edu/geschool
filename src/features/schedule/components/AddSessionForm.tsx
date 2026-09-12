'use client';

import { useActionState } from 'react';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Opt = { id: string; name: string };
type SlotOpt = { id: string; label: string };

export function AddSessionForm({
  action,
  slots,
  subjects,
  teachers,
  rooms,
  classes,
  selectedClassId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  slots: SlotOpt[];
  subjects: Opt[];
  teachers: Opt[];
  rooms: Opt[];
  classes: Opt[];
  selectedClassId: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un cours</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Classe" htmlFor="classId" required errors={err.classId}>
            <Select id="classId" name="classId" required defaultValue={selectedClassId ?? ''}>
              <option value="" disabled>
                —
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Debut" htmlFor="startSlotId" required errors={err.startSlotId}>
              <Select id="startSlotId" name="startSlotId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fin" htmlFor="endSlotId" required errors={err.endSlotId} hint="Meme jour que le debut">
              <Select id="endSlotId" name="endSlotId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Matiere" htmlFor="subjectId" required errors={err.subjectId}>
              <Select id="subjectId" name="subjectId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Enseignant" htmlFor="teacherId" errors={err.teacherId}>
              <Select id="teacherId" name="teacherId" defaultValue="">
                <option value="">— Aucun —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Salle" htmlFor="roomId" errors={err.roomId}>
              <Select id="roomId" name="roomId" defaultValue="">
                <option value="">— Aucune —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <SubmitButton size="sm">Ajouter le cours</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
