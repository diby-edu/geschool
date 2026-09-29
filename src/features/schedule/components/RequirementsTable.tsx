'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateRequirementAction, deleteRequirementAction } from '@/features/schedule/actions';
import type { RequirementRow } from '@/features/schedule/requirements';
import type { FormState } from '@/lib/forms';

/**
 * Où se passe ce cours ? Une seule question, trois réponses possibles. La cible
 * (salle précise ou type de salle) se choisit dans un second menu : « imposé »
 * ou « de préférence » s'applique à l'un comme à l'autre.
 */
const ROOM_MODES = [
  { v: 'NONE', l: 'N’importe quelle salle' },
  { v: 'PREFERRED', l: 'De préférence…' },
  { v: 'REQUIRED_ROOM', l: 'Obligatoirement…' },
];
const STATUSES = [
  { v: 'ACTIVE', l: 'Active' },
  { v: 'IGNORED', l: 'Ignoree' },
  { v: 'DRAFT', l: 'Brouillon' },
  { v: 'SATISFIED', l: 'Satisfaite' },
];
const ROOM_LABEL: Record<string, string> = Object.fromEntries(ROOM_MODES.map((m) => [m.v, m.l]));
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.v, s.l]));

export type RoomChoice = { id: string; name: string; kind: 'ROOM' | 'TYPE' };

export function RequirementsTable({
  slug,
  rows,
  canEdit,
  roomChoices = [],
  features = [],
}: {
  slug: string;
  rows: RequirementRow[];
  canEdit: boolean;
  /** Salles et types de salle de l'école, pour la cible de la règle. */
  roomChoices?: RoomChoice[];
  features?: { id: string; name: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-[--radius-card] border">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2">Enseignement</th>
            <th className="px-3 py-2">Enseignant(s)</th>
            <th className="px-3 py-2 text-center">Séances</th>
            <th className="px-3 py-2 text-center">Durée</th>
            <th className="px-3 py-2">Salle</th>
            <th className="px-3 py-2">État</th>
            {canEdit ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} slug={slug} r={r} canEdit={canEdit} roomChoices={roomChoices} features={features} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  slug,
  r,
  canEdit,
  roomChoices,
  features,
}: {
  slug: string;
  r: RequirementRow;
  canEdit: boolean;
  roomChoices: RoomChoice[];
  features: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateRequirementAction.bind(null, slug, r.id),
    {},
  );
  const err = state.fieldErrors ?? {};
  // « Obligatoirement » couvre salle ET type : le mode enregistré suit la cible.
  const modeValue = r.room_mode === 'REQUIRED_TYPE' ? 'REQUIRED_ROOM' : r.room_mode;
  const [mode, setMode] = useState(modeValue);
  const types = roomChoices.filter((c) => c.kind === 'TYPE');
  const rooms = roomChoices.filter((c) => c.kind === 'ROOM');

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{r.subject}</div>
        <div className="text-xs text-[color:var(--muted-foreground)]">{r.target}</div>
      </td>
      <td className="px-3 py-2 text-[color:var(--muted-foreground)]">{r.teachers}</td>

      {canEdit ? (
        <td className="px-3 py-2" colSpan={4}>
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            {state.error ? (
              <div className="w-full">
                <Alert tone="error">{state.error}</Alert>
              </div>
            ) : null}
            <div className="w-20">
              <Field label="Séances" htmlFor={`s-${r.id}`} errors={err.sessionsCount}>
                <Input id={`s-${r.id}`} name="sessionsCount" type="number" min="1" max="20" defaultValue={String(r.sessions_count)} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Durée (min)" htmlFor={`d-${r.id}`} errors={err.sessionDurationMinutes}>
                <Input id={`d-${r.id}`} name="sessionDurationMinutes" type="number" min="15" step="5" defaultValue={String(r.session_duration_minutes ?? 60)} />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Où ?" htmlFor={`rm-${r.id}`}>
                <Select id={`rm-${r.id}`} name="roomMode" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {ROOM_MODES.map((m) => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {mode !== 'NONE' ? (
              <div className="w-56">
                <Field label="Quelle salle" htmlFor={`rt-${r.id}`}>
                  <Select id={`rt-${r.id}`} name="roomTarget" defaultValue={r.room_target}>
                    <option value="">— Choisir —</option>
                    {types.length > 0 ? (
                      <optgroup label="Types de salle">
                        {types.map((c) => (
                          <option key={c.id} value={`T:${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {rooms.length > 0 ? (
                      <optgroup label="Salles précises">
                        {rooms.map((c) => (
                          <option key={c.id} value={`R:${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </Select>
                </Field>
              </div>
            ) : null}
            <div className="w-28">
              <Field label="Capacité mini" htmlFor={`mc-${r.id}`} errors={err.minCapacity}>
                <Input
                  id={`mc-${r.id}`}
                  name="minCapacity"
                  type="number"
                  min="0"
                  defaultValue={r.min_capacity === null ? '' : String(r.min_capacity)}
                />
              </Field>
            </div>
            {features.length > 0 ? (
              <details className="w-full">
                <summary className="cursor-pointer text-xs font-semibold text-[color:var(--muted-foreground)]">
                  Équipements exigés ({r.required_features.length})
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {features.map((f) => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        name="requiredFeatures"
                        value={f.id}
                        defaultChecked={r.required_features.includes(f.id)}
                        className="size-3.5"
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </details>
            ) : null}
            <div className="w-32">
              <Field label="État" htmlFor={`st-${r.id}`}>
                <Select id={`st-${r.id}`} name="status" defaultValue={r.status}>
                  {STATUSES.map((s) => (
                    <option key={s.v} value={s.v}>{s.l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <SubmitButton variant="secondary" size="sm">Enregistrer</SubmitButton>
          </form>
        </td>
      ) : (
        <>
          <td className="px-3 py-2 text-center">{r.sessions_count}</td>
          <td className="px-3 py-2 text-center">{r.session_duration_minutes ?? '—'} min</td>
          <td className="px-3 py-2">{ROOM_LABEL[r.room_mode] ?? r.room_mode}</td>
          <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
        </>
      )}

      {canEdit ? (
        <td className="px-3 py-2 text-right">
          <ConfirmSubmit
            action={deleteRequirementAction.bind(null, slug, r.id)}
            label="Supprimer"
            variant="secondary"
            confirmMessage={`Supprimer l'exigence « ${r.subject} — ${r.target} » ?`}
          />
        </td>
      ) : null}
    </tr>
  );
}
