'use client';

import { useActionState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/forms';

/**
 * Formulaire qui garde la saisie (cases cochées comprises) si l'enregistrement
 * échoue. Un formulaire `action=` est remis à son état d'origine par React
 * après chaque envoi : des cases décochées reviendraient cochées sans qu'on le
 * voie (constaté le 2026-10-26 sur les messages aux écoles).
 */
export function KeepForm({
  action,
  submit,
  className,
  children,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submit: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state.error ? (
        <div className="mb-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <div className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : submit}
        </Button>
      </div>
    </form>
  );
}
