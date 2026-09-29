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
import type { RoomSlotRule } from '../weekly-availability';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/**
 * « Cette salle n'est pas disponible tous les mercredis de 8 h à 10 h. »
 * La règle revient chaque semaine : la génération ne placera rien dedans, et la
 * salle ne sera pas proposée comme libre à ce moment-là.
 */
export function WeeklyRuleForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter une indisponibilité hebdomadaire</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Jour" htmlFor="dayOfWeek" required>
              <Select id="dayOfWeek" name="dayOfWeek" defaultValue="1">
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
              <Input id="endsAt" name="endsAt" type="time" defaultValue="10:00" required />
            </Field>
          </div>
          <Field label="Motif" htmlFor="reason" hint="Salle prêtée, club, réunion… (facultatif)">
            <Input id="reason" name="reason" maxLength={120} placeholder="Salle prêtée à l’association" />
          </Field>
          <SubmitButton size="sm">Enregistrer</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Chaque règle porte SA propre action de suppression, déjà liée côté serveur.
 * Un composant client ne peut pas recevoir une fonction ordinaire : passer
 * `(id) => action.bind(...)` fait planter la page entière (erreur « Functions
 * cannot be passed directly to Client Components »).
 */
export function WeeklyRuleList({
  rules,
  canEdit,
}: {
  rules: (RoomSlotRule & { deleteAction: Action })[];
  canEdit: boolean;
}) {
  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
          Aucune indisponibilité hebdomadaire : la salle est utilisable à tous les créneaux de la grille.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {rules.map((r) => (
        <li key={r.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm">
                <span className="font-medium">
                  {DAYS[r.dayOfWeek - 1]} · {r.startsAt}–{r.endsAt}
                </span>
                {r.reason ? (
                  <>
                    <br />
                    <span className="text-xs text-[color:var(--muted-foreground)]">{r.reason}</span>
                  </>
                ) : null}
              </span>
              {canEdit ? (
                <ConfirmSubmit
                  action={r.deleteAction}
                  label="Retirer"
                  variant="secondary"
                  confirmMessage="Retirer cette indisponibilité ? La salle redeviendra utilisable à ce créneau."
                />
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
