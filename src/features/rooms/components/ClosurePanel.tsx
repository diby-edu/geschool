'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import type { FormState } from '@/lib/forms';
import type { AffectedSession, ClosureRow } from '../closures';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const frDate = (iso: string) => iso.split('-').reverse().join('/');

/** Fermer la salle sur une période : travaux, examens, salle prêtée. */
export function ClosureCreateForm({ action, min, max }: { action: Action; min?: string; max?: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Fermer la salle sur une période</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Du" htmlFor="startsOn" required>
              <Input id="startsOn" name="startsOn" type="date" required {...(min ? { min } : {})} {...(max ? { max } : {})} />
            </Field>
            <Field label="Au (inclus)" htmlFor="endsOn" required>
              <Input id="endsOn" name="endsOn" type="date" required {...(min ? { min } : {})} {...(max ? { max } : {})} />
            </Field>
          </div>
          <Field label="Motif" htmlFor="reason" required hint="Travaux, examens, salle prêtée…">
            <Input id="reason" name="reason" required maxLength={120} placeholder="Travaux de peinture" />
          </Field>
          <SubmitButton size="sm">Enregistrer la fermeture</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Une fermeture, et les séances qu'elle touche. Rien n'est déplacé tout seul :
 * l'application ne saurait pas choisir à votre place. Chaque séance peut partir
 * dans une autre salle POUR CE JOUR-LÀ, sans changer les autres semaines.
 */
export function ClosureCard({
  closure,
  sessions,
  rooms,
  deleteAction,
  moveAction,
  canEdit,
}: {
  closure: ClosureRow;
  sessions: AffectedSession[];
  rooms: { id: string; name: string }[];
  deleteAction: Action;
  moveAction: (occurrenceId: string) => Action;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {closure.startsOn === closure.endsOn
                ? `Le ${frDate(closure.startsOn)}`
                : `Du ${frDate(closure.startsOn)} au ${frDate(closure.endsOn)}`}
            </p>
            <p className="text-sm text-[color:var(--muted-foreground)]">{closure.reason}</p>
          </div>
          {canEdit ? (
            <ConfirmSubmit
              action={deleteAction}
              label="Rouvrir"
              variant="secondary"
              confirmMessage="Lever cette fermeture ? La salle redevient utilisable sur ces dates."
            />
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Aucun cours n’était prévu ici sur cette période.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>
              {sessions.length} séance{sessions.length > 1 ? 's' : ''} prévue{sessions.length > 1 ? 's' : ''} dans cette
              salle
            </summary>
            <ul className="mt-2 space-y-2">
              {sessions.map((s) => (
                <SessionLine key={s.occurrenceId} session={s} rooms={rooms} action={moveAction(s.occurrenceId)} canEdit={canEdit} />
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function SessionLine({
  session,
  rooms,
  action,
  canEdit,
}: {
  session: AffectedSession;
  rooms: { id: string; name: string }[];
  action: Action;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <li className="space-y-1 rounded-2xl border p-2.5" style={{ backgroundColor: 'var(--surface)' }}>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-mono text-xs tabular-nums text-[color:var(--muted-foreground)]">
            {frDate(session.occursOn)} · {session.startsAt}–{session.endsAt}
          </span>
          <br />
          {session.subject} · {session.classes}
        </span>
        {canEdit ? (
          <form action={formAction} className="flex items-center gap-2">
            <Select name="targetRoomId" defaultValue="" aria-label="Déplacer vers">
              <option value="">— Déplacer vers —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <SubmitButton size="sm" variant="secondary">
              Déplacer
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </li>
  );
}
