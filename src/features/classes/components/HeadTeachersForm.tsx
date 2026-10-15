'use client';

import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { HeadTeacherRow } from '@/features/classes/head-teachers-types';

/**
 * Toutes les classes, un menu par classe. Les enseignants de la classe sont
 * proposés en premier ; « Remplir avec les suggestions » complète les classes
 * vides avec l'enseignant qui y a le plus d'heures. Rien n'est enregistré
 * avant « Enregistrer ».
 */
export function HeadTeachersForm({
  action,
  rows,
  teachers,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  rows: HeadTeacherRow[];
  teachers: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.classId, r.currentId ?? ''])),
  );
  const nameOf = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const empty = rows.filter((r) => !values[r.classId]).length;
  const withSuggestion = rows.filter((r) => !values[r.classId] && r.suggestionId).length;

  // Un enseignant principal de plusieurs classes : on le signale, sans l'interdire.
  const count = new Map<string, number>();
  for (const v of Object.values(values)) if (v) count.set(v, (count.get(v) ?? 0) + 1);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          <b>{rows.length - empty}</b> classe(s) sur {rows.length} ont un professeur principal.
        </span>
        {withSuggestion > 0 ? (
          <button
            type="button"
            className="rounded-xl border px-3 py-1.5 text-sm font-medium"
            onClick={() =>
              setValues((v) => {
                const next = { ...v };
                for (const r of rows) if (!next[r.classId] && r.suggestionId) next[r.classId] = r.suggestionId;
                return next;
              })
            }
          >
            Remplir les {withSuggestion} classe(s) vide(s) avec les suggestions
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Classe</th>
              <th className="px-3 py-2">Professeur principal</th>
              <th className="px-3 py-2">Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = values[r.classId] ?? '';
              const inClass = new Set(r.classTeacherIds);
              return (
                <tr key={r.classId} className="border-t">
                  <td className="px-3 py-1.5 font-medium">
                    {r.className}
                    {r.level ? <span className="ml-1 text-xs text-[color:var(--muted-foreground)]">{r.level}</span> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      name={`pp_${r.classId}`}
                      value={v}
                      onChange={(e) => setValues((s) => ({ ...s, [r.classId]: e.target.value }))}
                      className="h-9 w-full max-w-xs rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
                    >
                      <option value="">— Aucun —</option>
                      {r.classTeacherIds.length > 0 ? (
                        <optgroup label="Enseignent dans la classe">
                          {r.classTeacherIds.map((id) => (
                            <option key={id} value={id}>
                              {nameOf.get(id) ?? 'Enseignant'}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="Autres enseignants">
                        {teachers
                          .filter((t) => !inClass.has(t.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    {v && (count.get(v) ?? 0) > 1 ? (
                      <span className="ml-2 text-xs" style={{ color: 'var(--color-warning)' }}>
                        aussi principal de {(count.get(v) ?? 1) - 1} autre(s) classe(s)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-[color:var(--muted-foreground)]">
                    {r.suggestionId ? nameOf.get(r.suggestionId) : 'aucun enseignant affecté'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
