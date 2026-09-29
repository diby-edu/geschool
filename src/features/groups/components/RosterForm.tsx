'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { GroupStudent } from '@/features/groups/types';

/**
 * Qui est dans le groupe.
 *
 * Les cases cochées deviennent la composition EXACTE : décocher retire l'élève.
 * On affiche tous les élèves des classes rattachées, parce que le geste réel
 * est « je prends ceux-là dans cette liste », pas « je cherche un élève ».
 */
export function RosterForm({
  action,
  students,
  editable,
  maxSize,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  students: GroupStudent[];
  editable: boolean;
  maxSize: number | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [checked, setChecked] = useState<Set<string>>(
    new Set(students.filter((s) => s.inGroup).map((s) => s.studentId)),
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const over = maxSize !== null && checked.size > maxSize;

  return (
    <form action={formAction} className="space-y-3" data-live-hold>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {over ? (
        <Alert tone="error">
          {checked.size} élèves sélectionnés pour un effectif maximum de {maxSize}.
        </Alert>
      ) : null}

      <p className="text-sm text-[color:var(--muted-foreground)]">
        {checked.size} élève{checked.size > 1 ? 's' : ''} dans le groupe
        {maxSize ? ` sur ${maxSize} places` : ''} · {students.length} proposé{students.length > 1 ? 's' : ''}
      </p>

      <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
        {students.map((s) => (
          <li key={s.studentId}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="studentIds"
                value={s.studentId}
                checked={checked.has(s.studentId)}
                onChange={() => toggle(s.studentId)}
                disabled={!editable}
                className="size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">
                  {s.matricule}
                  {s.className ? ` · ${s.className}` : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {editable ? <SubmitButton>Enregistrer la composition</SubmitButton> : null}
    </form>
  );
}
