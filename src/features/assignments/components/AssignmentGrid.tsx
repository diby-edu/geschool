'use client';

import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { formatHours } from '@/features/programme/hours';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { AssignmentGrid as Grid } from '../grid';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const hm = (minutes: number) => (minutes > 0 ? `${Math.round((minutes / 60) * 10) / 10} h` : '—');

/**
 * Qui enseigne quoi, à quelle classe — en une grille.
 *
 * Les classes en lignes, les matières du programme en colonnes, un enseignant
 * par case. On remplit seize sixièmes en une page au lieu de cent soixante
 * formulaires, et les cases vides sautent aux yeux.
 *
 * Deux sens de lecture : « par classe » (remplir une classe entière) et « par
 * matière » (donner toutes les sixièmes de maths au même professeur).
 */
export function AssignmentGrid({
  grid,
  action,
  canEdit,
}: {
  grid: Grid;
  action: Action;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [bySubject, setBySubject] = useState(false);
  const [cells, setCells] = useState<Record<string, string>>(grid.cells);
  const [highlight, setHighlight] = useState(true);

  const total = grid.classes.length * grid.subjects.length;
  const filled = useMemo(() => Object.values(cells).filter(Boolean).length, [cells]);

  /**
   * Charge en direct, en MINUTES : ce qui est confié ailleurs, moins ce que
   * cette grille contenait, plus ce qu'elle contient maintenant. On voit donc
   * le plafond se remplir pendant qu'on coche, sans attendre l'enregistrement.
   */
  const minutesOf = (subjectId: string) => grid.subjects.find((s) => s.id === subjectId)?.weeklyMinutes ?? 0;

  const load = (() => {
    const base: Record<string, { courses: number; minutes: number }> = {};
    for (const t of grid.teachers) base[t.id] = { courses: t.courses, minutes: t.minutes };
    const adjust = (key: string, teacherId: string, sign: 1 | -1) => {
      const subjectId = key.split(':')[1] ?? '';
      const cur = base[teacherId] ?? { courses: 0, minutes: 0 };
      base[teacherId] = {
        courses: cur.courses + sign,
        minutes: cur.minutes + sign * minutesOf(subjectId),
      };
    };
    for (const [key, t] of Object.entries(grid.cells)) if (t) adjust(key, t, -1);
    for (const [key, t] of Object.entries(cells)) if (t) adjust(key, t, 1);
    return base;
  })();

  const busiest = grid.teachers
    .map((t) => {
      const l = load[t.id] ?? { courses: 0, minutes: 0 };
      const over = t.maxMinutes != null && l.minutes > t.maxMinutes;
      const under = t.minMinutes != null && l.minutes > 0 && l.minutes < t.minMinutes;
      return { ...t, ...l, over, under };
    })
    .filter((t) => t.minutes > 0 || t.courses > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 12);

  const overloaded = busiest.filter((t) => t.over);

  if (grid.classes.length === 0) {
    return <Alert tone="info">Ce niveau n’a aucune classe : créez-en avant d’affecter des enseignants.</Alert>;
  }
  if (grid.subjects.length === 0) {
    return (
      <Alert tone="info">
        Ce niveau n’a aucune matière à son programme : renseignez-le dans Matières → Matières par niveau.
      </Alert>
    );
  }

  type Axis = { id: string; code: string; name: string; weeklyMinutes?: number };
  const asAxis = (x: Grid['classes'][number] | Grid['subjects'][number]): Axis =>
    'weeklyMinutes' in x ? { id: x.id, code: x.code, name: x.name, weeklyMinutes: x.weeklyMinutes } : { id: x.id, code: x.code, name: x.name };
  const rows: Axis[] = (bySubject ? grid.subjects : grid.classes).map(asAxis);
  const cols: Axis[] = (bySubject ? grid.classes : grid.subjects).map(asAxis);
  const keyOf = (rowId: string, colId: string) => (bySubject ? `${colId}:${rowId}` : `${rowId}:${colId}`);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            { value: false, label: 'Par classe' },
            { value: true, label: 'Par matière' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setBySubject(o.value)}
              aria-pressed={bySubject === o.value}
              className="cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                bySubject === o.value
                  ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
              }
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold tabular-nums">
            {filled} / {total}
          </span>
          <span className="text-[color:var(--muted-foreground)]">affectation(s)</span>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="size-4" />
            Surligner les cases vides
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border" style={{ backgroundColor: 'var(--surface)' }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-[color:var(--muted-foreground)]">
              <th className="sticky left-0 z-10 px-4 py-3 text-left font-medium" style={{ backgroundColor: 'var(--surface)' }}>
                {bySubject ? 'Matière' : 'Classe'}
              </th>
              {cols.map((c) => (
                <th key={c.id} className="px-2 py-3 text-center font-medium">
                  <span className="block text-xs font-bold">{c.code}</span>
                  {c.weeklyMinutes !== undefined ? (
                    <span className="block text-[10px] font-normal text-[color:var(--muted-foreground)]">
                      {hm(c.weeklyMinutes)}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 px-4 py-2 text-left font-medium"
                  style={{ backgroundColor: 'var(--surface)' }}
                >
                  {r.name}
                  {r.weeklyMinutes !== undefined ? (
                    <span className="block text-[10px] font-normal text-[color:var(--muted-foreground)]">
                      {hm(r.weeklyMinutes)}
                    </span>
                  ) : null}
                </th>
                {cols.map((c) => {
                  const key = keyOf(r.id, c.id);
                  const value = cells[key] ?? '';
                  const subjectId = bySubject ? r.id : c.id;
                  const suited = grid.teachers.filter((t) => t.subjectIds.includes(subjectId));
                  const others = grid.teachers.filter((t) => !t.subjectIds.includes(subjectId));
                  return (
                    <td key={c.id} className="px-1 py-1">
                      <select
                        name={`prof:${bySubject ? c.id : r.id}:${subjectId}`}
                        value={value}
                        disabled={!canEdit}
                        onChange={(e) => setCells((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="h-8 w-40 rounded-lg border px-1 text-xs"
                        style={{
                          backgroundColor: !value && highlight ? 'var(--color-warning-muted, #fff7e6)' : 'var(--surface)',
                        }}
                        aria-label={`Enseignant pour ${r.name} · ${c.name}`}
                      >
                        <option value="">— prof —</option>
                        {suited.length > 0 ? (
                          <optgroup label="Enseigne cette matière">
                            {suited.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {others.length > 0 ? (
                          <optgroup label="Autres enseignants">
                            {others.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {busiest.length > 0 ? (
        <Card>
          <CardContent className="py-3">
            <p className="mb-2 text-sm font-semibold">Charge par enseignant</p>
            <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">
              Service hebdomadaire, tous niveaux confondus, mis à jour pendant que vous cochez. Un plafond dépassé se
              voit ici — pas au moment où la génération échoue.
            </p>
            {overloaded.length > 0 ? (
              <Alert tone="error">
                {overloaded.length === 1
                  ? `${overloaded[0]!.name} dépasse son service maximum.`
                  : `${overloaded.length} enseignants dépassent leur service maximum.`}{' '}
                L’emploi du temps ne pourra pas placer toutes leurs heures.
              </Alert>
            ) : null}
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {busiest.map((t) => (
                <li
                  key={t.id}
                  className="rounded-full border px-3 py-1"
                  style={
                    t.over
                      ? { borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }
                      : t.under
                        ? { borderColor: 'var(--color-warning)' }
                        : undefined
                  }
                  title={
                    t.maxMinutes != null || t.minMinutes != null
                      ? `Service ${t.fromDefault ? 'du contrat' : 'de sa fiche'} : ${t.minMinutes != null ? `${formatHours(t.minMinutes)} minimum` : 'sans minimum'}, ${t.maxMinutes != null ? `${formatHours(t.maxMinutes)} maximum` : 'sans maximum'}`
                      : 'Aucun service déclaré, ni sur sa fiche ni pour son type de contrat'
                  }
                >
                  {t.name}{' '}
                  <span className="font-semibold tabular-nums">
                    {formatHours(t.minutes)}
                    {t.maxMinutes != null ? ` / ${formatHours(t.maxMinutes)}` : ''}
                  </span>{' '}
                  <span className="text-xs text-[color:var(--muted-foreground)]">
                    ({t.courses} cours)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>Enregistrer les affectations</SubmitButton>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            Une case remise sur « — prof — » retire l’affectation.
          </span>
        </div>
      ) : null}
    </form>
  );
}
