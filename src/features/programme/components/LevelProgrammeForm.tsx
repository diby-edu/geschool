'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { formatHours, minutesFromSessions, sessionsValue } from '../hours';

export type ProgrammeSubject = { id: string; code: string; name: string; defaultCoefficient: number };
export type ProgrammeCurrent = Record<string, { coefficient: number; weeklyMinutes: number; mandatory: boolean }>;

type RowState = { on: boolean; coef: string; sessions: string; fac: boolean };

const EMPTY_ROW: RowState = { on: false, coef: '', sessions: '', fac: false };

/**
 * Le programme d'un niveau, réglé en une seule fois.
 *
 * Toutes les matières de l'ordre d'enseignement du niveau sont là, cochées ou
 * non : on ne cherche plus une matière dans une liste déroulante pour l'ajouter,
 * et on ne supprime plus ligne par ligne. Cocher met la matière au programme,
 * décocher l'en retire, et l'on corrige coefficient, volume horaire et
 * caractère facultatif sans changer d'écran.
 *
 * Ce qui est enregistré ici se retrouve partout où le programme compte : le
 * tableau croisé des coefficients, la grille d'affectation des enseignants
 * (qui reprend le volume horaire) et le calcul des moyennes des bulletins.
 */
export function LevelProgrammeForm({
  action,
  levelId,
  levelName,
  returnTo,
  subjects,
  current,
  canEdit,
  sessionMinutes,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  levelId: string;
  levelName: string;
  /** Page où revenir après l'enregistrement (l'onglet d'où l'on vient). */
  returnTo: string;
  subjects: ProgrammeSubject[];
  current: ProgrammeCurrent;
  canEdit: boolean;
  /** Durée d'une séance dans cet établissement : 55 min, 60 min… */
  sessionMinutes: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      subjects.map((s) => {
        const entry = current[s.id];
        return [
          s.id,
          entry
            ? {
                on: true,
                coef: String(entry.coefficient),
                sessions: sessionsValue(entry.weeklyMinutes, sessionMinutes),
                fac: !entry.mandatory,
              }
            : { on: false, coef: '', sessions: '', fac: false },
        ];
      }),
    ),
  );

  const rowOf = (id: string): RowState => rows[id] ?? EMPTY_ROW;

  const patch = (id: string, change: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...change } }));

  /** Cocher une matière sans coefficient reprend celui de la matière : on ne part jamais de zéro. */
  const toggle = (s: ProgrammeSubject, on: boolean) => {
    const row = rowOf(s.id);
    patch(s.id, { on, coef: on && !row.coef ? String(s.defaultCoefficient) : row.coef });
  };

  const chosen = subjects.filter((s) => rowOf(s.id).on);
  const totalCoef = chosen.reduce((sum, s) => {
    const n = Number(rowOf(s.id).coef.replace(',', '.'));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const totalSessions = chosen.reduce((sum, s) => sum + (Number(rowOf(s.id).sessions) || 0), 0);
  const totalMinutes = chosen.reduce((sum, s) => sum + minutesFromSessions(rowOf(s.id).sessions, sessionMinutes), 0);

  if (subjects.length === 0) {
    return (
      <Alert tone="info">
        Aucune matière n’existe pour cet ordre d’enseignement. Créez-les dans l’onglet « Liste des matières », elles
        apparaîtront ici.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="levelId" value={levelId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <p className="text-sm font-semibold">Programme de {levelName}</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              <span className="font-semibold text-[color:var(--foreground)]">{chosen.length}</span> matière
              {chosen.length > 1 ? 's' : ''} · coefficient total{' '}
              <span className="font-semibold text-[color:var(--foreground)]">
                {Math.round(totalCoef * 100) / 100}
              </span>
              {totalSessions > 0 ? (
                <>
                  {' · '}
                  <span className="font-semibold text-[color:var(--foreground)]">{totalSessions}</span> séance
                  {totalSessions > 1 ? 's' : ''} par semaine{' '}
                  <span className="text-xs">({formatHours(totalMinutes)} de cours)</span>
                </>
              ) : null}
            </p>
          </div>

          <ul>
            {subjects.map((s) => {
              const row = rowOf(s.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 last:border-0"
                  style={row.on ? { backgroundColor: 'var(--color-brand-muted)' } : undefined}
                >
                  <input type="hidden" name="sid" value={s.id} />

                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name={`on:${s.id}`}
                      checked={row.on}
                      onChange={(e) => toggle(s, e.target.checked)}
                      disabled={!canEdit}
                      className="size-4 shrink-0"
                    />
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold text-[color:var(--muted-foreground)]"
                      style={{ backgroundColor: 'var(--surface)' }}
                    >
                      {s.code}
                    </span>
                    <span className={`truncate${row.on ? ' font-medium' : ''}`}>{s.name}</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Coef.
                    <input
                      name={`coef:${s.id}`}
                      value={row.coef}
                      onChange={(e) => patch(s.id, { coef: e.target.value })}
                      inputMode="decimal"
                      required={row.on}
                      disabled={!canEdit}
                      aria-label={`Coefficient de ${s.name}`}
                      placeholder={String(s.defaultCoefficient)}
                      className="h-8 w-16 rounded-lg border px-2 text-center text-sm tabular-nums"
                      style={{ backgroundColor: 'var(--surface)' }}
                    />
                  </label>

                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Séances
                    <input
                      name={`s:${s.id}`}
                      value={row.sessions}
                      onChange={(e) => patch(s.id, { sessions: e.target.value })}
                      inputMode="numeric"
                      disabled={!canEdit}
                      aria-label={`Séances hebdomadaires de ${s.name}`}
                      placeholder="—"
                      title={`Nombre de cours par semaine. Une séance dure ${sessionMinutes} min.`}
                      className="h-8 w-16 rounded-lg border px-2 text-center text-sm tabular-nums"
                      style={{ backgroundColor: 'var(--surface)' }}
                    />
                  </label>

                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]"
                    title="Matière facultative : elle ne compte pas comme une matière obligatoire du niveau."
                  >
                    <input
                      type="checkbox"
                      name={`fac:${s.id}`}
                      checked={row.fac}
                      onChange={(e) => patch(s.id, { fac: e.target.checked })}
                      disabled={!canEdit}
                      className="size-4"
                    />
                    Fac.
                  </label>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {canEdit ? (
        <div
          className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <SubmitButton>Enregistrer le programme</SubmitButton>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            Une matière décochée quitte le programme de ce niveau. « Séances » est le nombre de cours par semaine —
            une séance dure {sessionMinutes} min dans cet établissement.
          </span>
        </div>
      ) : null}
    </form>
  );
}
