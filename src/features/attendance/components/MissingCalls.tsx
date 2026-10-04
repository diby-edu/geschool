'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { GapReason, MissingCall } from '@/features/attendance/gap-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Les creneaux passes sans appel.
 *
 * L'ecran NE CONCLUT RIEN : il affiche, et demande qu'on qualifie. Tant qu'un
 * creneau n'est pas qualifie, il reste « a verifier » — pas « faute de
 * l'enseignant ».
 */
export function MissingCalls({
  rows,
  reasons,
  qualify,
  clear,
  canQualify,
  from,
  to,
  prof,
}: {
  rows: MissingCall[];
  reasons: GapReason[];
  qualify: Action;
  clear: Action;
  canQualify: boolean;
  from: string;
  to: string;
  /** L'enseignant ouvert, pour y revenir apres une qualification. */
  prof: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Alert tone="success">
        Tous les cours terminés de cette période ont leur appel. Rien à vérifier.
      </Alert>
    );
  }

  const aQualifier = rows.filter((r) => !r.reason).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[color:var(--muted-foreground)]">
        {rows.length} créneau{rows.length > 1 ? 'x' : ''} sans appel, dont{' '}
        <strong>{aQualifier} à vérifier</strong>. Un appel manquant ne dit pas à lui seul que l’enseignant était
        absent&nbsp;: dites ce qui s’est passé.
      </p>

      <ul className="space-y-2">
        {rows.map((r) => (
          <GapRow
            key={r.occurrenceId}
            row={r}
            reasons={reasons}
            qualify={qualify}
            clear={clear}
            canQualify={canQualify}
            from={from}
            to={to}
            prof={prof}
          />
        ))}
      </ul>
    </div>
  );
}

function GapRow({
  row,
  reasons,
  qualify,
  clear,
  canQualify,
  from,
  to,
  prof,
}: {
  row: MissingCall;
  reasons: GapReason[];
  qualify: Action;
  clear: Action;
  canQualify: boolean;
  from: string;
  to: string;
  prof: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(qualify, {});
  const [effaceState, effaceAction] = useActionState<FormState, FormData>(clear, {});
  const [ouvert, setOuvert] = useState(false);

  const motif = reasons.find((m) => m.code === row.reason);
  const jour = new Date(`${row.date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <li className="rounded-[--radius-card] border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.klass} — {row.subject}
          </p>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            {jour} · {row.startsAt}–{row.endsAt} · {row.teacher ?? 'Enseignant non renseigné'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {motif ? (
            <span
              className="rounded-full border px-2 py-0.5 text-xs"
              style={motif.blamesTeacher ? { color: 'var(--color-warning)', borderColor: 'var(--color-warning)' } : undefined}
            >
              {motif.label}
            </span>
          ) : (
            <span className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--muted-foreground)]">
              À vérifier
            </span>
          )}
          {canQualify ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert((o) => !o)}>
              {ouvert ? 'Fermer' : row.reason ? 'Modifier' : 'Qualifier'}
            </Button>
          ) : null}
        </div>
      </div>

      {row.note ? (
        <p className="border-t px-3 py-1.5 text-xs text-[color:var(--muted-foreground)]">{row.note}</p>
      ) : null}

      {ouvert && canQualify ? (
        <div className="space-y-2 border-t px-3 py-2">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {effaceState.error ? <Alert tone="error">{effaceState.error}</Alert> : null}

          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="occurrenceId" value={row.occurrenceId} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            {prof ? <input type="hidden" name="prof" value={prof} /> : null}

            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`reason-${row.occurrenceId}`}>
                Que s’est-il passé ?
              </label>
              <select
                id={`reason-${row.occurrenceId}`}
                name="reason"
                defaultValue={row.reason ?? ''}
                className="h-9 rounded-xl border bg-[color:var(--surface)] px-2 text-sm"
                required
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {reasons.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[14rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor={`note-${row.occurrenceId}`}>
                Précision (facultative)
              </label>
              <input
                id={`note-${row.occurrenceId}`}
                name="note"
                defaultValue={row.note ?? ''}
                maxLength={500}
                className="w-full rounded-xl border px-2 py-1.5 text-sm"
                placeholder="Sortie pédagogique, remplacement…"
              />
            </div>

            <SubmitButton>Enregistrer</SubmitButton>
          </form>

          {row.reason ? (
            <form action={effaceAction}>
              <input type="hidden" name="occurrenceId" value={row.occurrenceId} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              {prof ? <input type="hidden" name="prof" value={prof} /> : null}
              <button type="submit" className="text-xs text-[color:var(--muted-foreground)] underline">
                Retirer cette qualification
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
