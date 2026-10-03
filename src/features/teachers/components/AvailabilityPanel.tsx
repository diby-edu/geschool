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
import type { AvailabilityKind, TeacherSlotRule } from '../availability';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const KIND_LABEL: Record<AvailabilityKind, string> = {
  UNAVAILABLE: 'Indisponible',
  AVOID: 'À éviter',
};

/**
 * « M. Koffi enseigne ailleurs le mercredi matin. »
 *
 * Le générateur lisait déjà ces contraintes sans que personne puisse les
 * saisir. Deux niveaux, et pas davantage : ce qui bloque, et ce qu'on
 * préférerait éviter.
 */
export function AvailabilityForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter une contrainte</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Jour" htmlFor="dayOfWeek" required>
              <Select id="dayOfWeek" name="dayOfWeek" defaultValue="3">
                {DAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="De" htmlFor="startsAt" required>
              <Input id="startsAt" name="startsAt" type="time" defaultValue="08:00" required />
            </Field>
            <Field label="À" htmlFor="endsAt" required>
              <Input id="endsAt" name="endsAt" type="time" defaultValue="12:00" required />
            </Field>
            <Field label="Niveau" htmlFor="kind" required>
              <Select id="kind" name="kind" defaultValue="UNAVAILABLE">
                <option value="UNAVAILABLE">Indisponible — aucun cours</option>
                <option value="AVOID">À éviter — si possible</option>
              </Select>
            </Field>
          </div>
          <Field label="Motif" htmlFor="reason" hint="Facultatif, mais utile six mois plus tard.">
            <Input id="reason" name="reason" placeholder="Enseigne au lycée municipal" />
          </Field>
          <SubmitButton>Ajouter</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function AvailabilityList({
  rules,
  canEdit,
}: {
  rules: (TeacherSlotRule & { deleteAction: Action })[];
  canEdit: boolean;
}) {
  if (rules.length === 0) {
    return (
      <p className="rounded-2xl border p-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--surface)' }}>
        Aucune contrainte : l’emploi du temps peut placer cet enseignant à n’importe quelle heure d’ouverture.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {rules.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-2 text-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <span>
            <strong>{DAYS[r.dayOfWeek - 1]}</strong> de {r.startsAt} à {r.endsAt}
            <span
              className="ml-2 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: 'var(--muted)',
                color: r.kind === 'UNAVAILABLE' ? 'var(--color-danger)' : 'var(--color-warning)',
              }}
            >
              {KIND_LABEL[r.kind]}
            </span>
            {r.reason ? <span className="ml-2 text-[color:var(--muted-foreground)]">{r.reason}</span> : null}
          </span>
          {canEdit ? (
            <ConfirmSubmit
              action={r.deleteAction}
              label="Retirer"
              confirmMessage="Retirer cette contrainte ? L’emploi du temps pourra de nouveau placer un cours ici."
              variant="danger"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
