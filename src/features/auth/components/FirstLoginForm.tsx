'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { completeFirstLogin, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';

export function FirstLoginForm() {
  const [state, action] = useActionState<AuthState, FormData>(completeFirstLogin, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={10}
        />
      </div>

      <div>
        <Label htmlFor="confirm">Confirmation</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      <SubmitButton className="w-full">Definir mon mot de passe</SubmitButton>
    </form>
  );
}
