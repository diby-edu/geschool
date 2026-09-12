'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateRequirementAction, deleteRequirementAction } from '@/features/schedule/actions';
import type { RequirementRow } from '@/features/schedule/requirements';
import type { FormState } from '@/lib/forms';

const ROOM_MODES = [
  { v: 'NONE', l: 'Aucune salle imposee' },
  { v: 'PREFERRED', l: 'Salle preferee' },
  { v: 'REQUIRED_ROOM', l: 'Salle imposee' },
  { v: 'REQUIRED_TYPE', l: 'Type de salle impose' },
];
const STATUSES = [
  { v: 'ACTIVE', l: 'Active' },
  { v: 'IGNORED', l: 'Ignoree' },
  { v: 'DRAFT', l: 'Brouillon' },
  { v: 'SATISFIED', l: 'Satisfaite' },
];
const ROOM_LABEL: Record<string, string> = Object.fromEntries(ROOM_MODES.map((m) => [m.v, m.l]));
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.v, s.l]));

export function RequirementsTable({ slug, rows, canEdit }: { slug: string; rows: RequirementRow[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-[--radius-card] border">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2">Enseignement</th>
            <th className="px-3 py-2">Enseignant(s)</th>
            <th className="px-3 py-2 text-center">Seances</th>
            <th className="px-3 py-2 text-center">Duree</th>
            <th className="px-3 py-2">Salle</th>
            <th className="px-3 py-2">Etat</th>
            {canEdit ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} slug={slug} r={r} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ slug, r, canEdit }: { slug: string; r: RequirementRow; canEdit: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateRequirementAction.bind(null, slug, r.id),
    {},
  );
  const err = state.fieldErrors ?? {};

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
              <Field label="Seances" htmlFor={`s-${r.id}`} errors={err.sessionsCount}>
                <Input id={`s-${r.id}`} name="sessionsCount" type="number" min="1" max="20" defaultValue={String(r.sessions_count)} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Duree (min)" htmlFor={`d-${r.id}`} errors={err.sessionDurationMinutes}>
                <Input id={`d-${r.id}`} name="sessionDurationMinutes" type="number" min="15" step="5" defaultValue={String(r.session_duration_minutes ?? 60)} />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Salle" htmlFor={`rm-${r.id}`}>
                <Select id={`rm-${r.id}`} name="roomMode" defaultValue={r.room_mode}>
                  {ROOM_MODES.map((m) => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-32">
              <Field label="Etat" htmlFor={`st-${r.id}`}>
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
