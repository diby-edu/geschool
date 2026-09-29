'use client';

import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { PermissionGroup } from '@/lib/permissions/catalog';

/**
 * Grille de cases des droits d'une fonction. L'état des cases est local jusqu'à
 * l'enregistrement : rien n'est appliqué tant qu'on n'a pas validé, et un
 * rafraîchissement automatique de la page ne l'écrase jamais (`data-live-hold`
 * dès qu'une case a changé).
 */
export function RolePermissionsForm({
  action,
  groups,
  initial,
  locked,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  groups: PermissionGroup[];
  initial: string[];
  /** Fondateur : tout est coché et rien ne se modifie. */
  locked: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial));

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);
  const initialSet = useMemo(() => new Set(initial), [initial]);
  const dirty = useMemo(() => {
    if (checked.size !== initialSet.size) return true;
    for (const c of checked) if (!initialSet.has(c)) return true;
    return false;
  }, [checked, initialSet]);

  const toggle = (code: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const setGroup = (group: PermissionGroup, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const i of group.items) {
        if (on) next.add(i.code);
        else next.delete(i.code);
      }
      return next;
    });

  return (
    <form action={formAction} className="space-y-4" {...(dirty ? { 'data-live-hold': '' } : {})}>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-4">
        {groups.map((group) => {
          const n = group.items.filter((i) => checked.has(i.code)).length;
          return (
            <fieldset key={group.id} className="rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
              <legend className="sr-only">{group.label}</legend>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-sm font-semibold">
                  {group.label}{' '}
                  <span className="ml-1 text-xs font-normal tabular-nums text-[color:var(--muted-foreground)]">
                    {n} / {group.items.length}
                  </span>
                </p>
                {locked ? null : (
                  <span className="flex gap-3 text-xs">
                    <button type="button" className="text-[color:var(--color-brand)] hover:underline" onClick={() => setGroup(group, true)}>
                      Tout cocher
                    </button>
                    <button type="button" className="text-[color:var(--muted-foreground)] hover:underline" onClick={() => setGroup(group, false)}>
                      Tout décocher
                    </button>
                  </span>
                )}
              </div>
              <ul className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.code}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-[color:var(--color-brand-muted)]">
                      <input
                        type="checkbox"
                        name="perm"
                        value={item.code}
                        checked={checked.has(item.code)}
                        disabled={locked}
                        onChange={() => toggle(item.code)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]"
                      />
                      <span className="text-sm leading-snug">
                        {item.label}
                        {item.hint ? (
                          <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">{item.hint}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>

      {locked ? null : (
        <div
          className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border px-4 py-3 shadow-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <p className="text-sm text-[color:var(--muted-foreground)]" role="status">
            <span className="font-medium tabular-nums text-[color:var(--foreground)]">{checked.size}</span> droits sur {total}
            {dirty ? ' · modifications non enregistrées' : ''}
          </p>
          <SubmitButton disabled={!dirty}>Enregistrer les droits</SubmitButton>
        </div>
      )}
    </form>
  );
}
