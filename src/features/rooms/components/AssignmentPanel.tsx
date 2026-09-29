'use client';

import { useActionState } from 'react';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import {
  CAPACITY_RULE_LABELS,
  ROOM_MODE_LABELS,
  type CapacityRule,
  type RoomMode,
  type RoomPolicy,
} from '../policy';
import type { AssignmentRow, RoomOption } from '../assignments';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Réglage de l'établissement : comment les salles sont occupées. */
export function RoomPolicyForm({ action, policy }: { action: Action; policy: RoomPolicy }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Comment votre école occupe ses salles</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Ce réglage décide du comportement par défaut. Un cours peut toujours exiger une salle particulière
            (laboratoire, atelier, terrain) : cette exigence passe avant tout le reste.
          </p>
        </div>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ROOM_MODE_LABELS) as RoomMode[]).map((m) => (
              <label
                key={m}
                className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <input type="radio" name="mode" value={m} defaultChecked={policy.mode === m} className="mt-0.5 size-4" />
                <span>
                  <span className="font-semibold">{ROOM_MODE_LABELS[m].title}</span>
                  <br />
                  <span className="text-xs text-[color:var(--muted-foreground)]">{ROOM_MODE_LABELS[m].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Si l’effectif dépasse la capacité de la salle</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(CAPACITY_RULE_LABELS) as CapacityRule[]).map((c) => (
                <label
                  key={c}
                  className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
                  style={{ backgroundColor: 'var(--surface)' }}
                >
                  <input
                    type="radio"
                    name="capacity"
                    value={c}
                    defaultChecked={policy.capacity === c}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-semibold">{CAPACITY_RULE_LABELS[c].title}</span>
                    <br />
                    <span className="text-xs text-[color:var(--muted-foreground)]">{CAPACITY_RULE_LABELS[c].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <SubmitButton size="sm">Enregistrer le réglage</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

/** Une ligne : la classe, son effectif, et la salle qu'on lui donne. */
export function AssignmentRowForm({
  action,
  row,
  rooms,
  canEdit,
}: {
  action: Action;
  row: AssignmentRow;
  rooms: RoomOption[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const students = row.enrolled || row.capacity;
  const tight = row.roomCapacity !== null && row.roomCapacity > 0 && students > row.roomCapacity;

  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="font-medium">{row.className}</span>{' '}
            <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{row.classCode}</span>
            <br />
            <span className="text-xs text-[color:var(--muted-foreground)]">
              {row.enrolled > 0 ? `${row.enrolled} élève${row.enrolled > 1 ? 's' : ''} inscrits` : `${row.capacity} places prévues`}
              {row.roomCapacity !== null ? ` · salle de ${row.roomCapacity} places` : ''}
            </span>
          </span>
          {canEdit ? (
            <form action={formAction} className="flex shrink-0 items-center gap-2">
              <Select name="roomId" defaultValue={row.roomId ?? ''} aria-label={`Salle de ${row.className}`}>
                <option value="">— Aucune —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity})
                  </option>
                ))}
              </Select>
              <SubmitButton size="sm" variant="secondary">
                Affecter
              </SubmitButton>
            </form>
          ) : (
            <span className="text-sm">{row.roomName ?? '—'}</span>
          )}
        </div>
        {tight ? (
          <p className="text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>
            Salle trop petite : {row.roomCapacity} places pour {students} élèves.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
