'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/lib/forms';

/**
 * Bouton d'action destructive avec confirmation navigateur. La confirmation est
 * un garde-fou minimal ; l'autorisation reelle est verifiee cote serveur par
 * l'action. Affiche l'erreur renvoyee (ex. suppression refusee car reference).
 */
export function ConfirmSubmit({
  action,
  label,
  confirmMessage,
  variant = 'danger',
  hidden,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  confirmMessage: string;
  variant?: 'danger' | 'secondary';
  /** Champs caches a transmettre a l'action (le marqueur de mise en route). */
  hidden?: Record<string, string> | undefined;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <div className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm(confirmMessage)) e.preventDefault();
        }}
      >
        {hidden
          ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
          : null}
        <Button type="submit" variant={variant} size="sm">
          {label}
        </Button>
      </form>
    </div>
  );
}
