'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { requestPasswordReset, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';

export function PasswordResetForm() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="info">{state.error}</Alert> : null}
      <div>
        <Label htmlFor="email">Adresse email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <SubmitButton className="w-full">Envoyer le lien</SubmitButton>
      <p className="text-center text-sm text-[color:var(--muted-foreground)]">
        Parents et eleves : contactez l&apos;etablissement pour reinitialiser votre acces.
      </p>
    </form>
  );
}
