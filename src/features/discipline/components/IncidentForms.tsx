'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
export type StudentOption = { id: string; name: string; className: string };

/**
 * Signaler un incident : qui, quoi, quand, et ce qui s'est passé.
 *
 * Un enseignant peut signaler pour ses élèves sans droit particulier ; la
 * sanction, elle, se décide ailleurs.
 */
export function IncidentForm({
  action,
  students,
  types,
  today,
}: {
  action: Action;
  students: StudentOption[];
  types: { id: string; name: string; points: number }[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const [studentId, setStudentId] = useState('');
  const chosen = students.find((s) => s.id === studentId);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Élève" htmlFor="studentId" required errors={err.studentId}>
            <Select id="studentId" name="studentId" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— Choisir —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.className}
                </option>
              ))}
            </Select>
          </Field>
          {chosen ? (
            <p className="-mt-2 text-xs text-[color:var(--muted-foreground)]">Classe au moment des faits : {chosen.className}</p>
          ) : null}

          <Field label="Motif" htmlFor="incidentTypeId" required errors={err.incidentTypeId}>
            <Select id="incidentTypeId" name="incidentTypeId" required defaultValue="">
              <option value="">— Choisir —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.points > 0 ? ` (${t.points} point${t.points > 1 ? 's' : ''})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date des faits" htmlFor="occurredOn" required errors={err.occurredOn}>
              <Input id="occurredOn" name="occurredOn" type="date" required defaultValue={today} max={today} />
            </Field>
            <Field label="Heure" htmlFor="occurredAt" hint="Facultatif">
              <Input id="occurredAt" name="occurredAt" type="time" />
            </Field>
          </div>

          <Field label="Ce qui s’est passé" htmlFor="description" errors={err.description}>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={2000}
              className="w-full rounded-[--radius-card] border bg-[color:var(--surface)] p-3 text-sm"
              placeholder="Décrivez les faits, sans jugement : ce qui a été vu ou entendu."
            />
          </Field>

          <SubmitButton>Signaler l’incident</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

/** Prononcer une sanction, rattachée ou non à un incident. */
export function SanctionForm({
  action,
  studentId,
  studentName,
  types,
}: {
  action: Action;
  studentId: string;
  studentName: string;
  types: { id: string; name: string; needsDates: boolean }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const [typeId, setTypeId] = useState('');
  const needsDates = types.find((t) => t.id === typeId)?.needsDates ?? false;

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="studentId" value={studentId} />
      <Field label={`Sanction pour ${studentName}`} htmlFor={`st-${studentId}`} required errors={err.sanctionTypeId}>
        <Select
          id={`st-${studentId}`}
          name="sanctionTypeId"
          required
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>

      {needsDates ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Du" htmlFor={`sf-${studentId}`}>
            <Input id={`sf-${studentId}`} name="startsOn" type="date" />
          </Field>
          <Field label="Au (inclus)" htmlFor={`se-${studentId}`}>
            <Input id={`se-${studentId}`} name="endsOn" type="date" />
          </Field>
        </div>
      ) : null}

      <Field label="Précision" htmlFor={`sn-${studentId}`}>
        <Input id={`sn-${studentId}`} name="notes" maxLength={200} placeholder="Facultatif" />
      </Field>
      <SubmitButton size="sm">Prononcer</SubmitButton>
    </form>
  );
}
