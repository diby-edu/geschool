'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { loginWithEmail, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';

export function EmailLoginForm({ next }: { next?: string | undefined }) {
  const [state, action] = useActionState<AuthState, FormData>(loginWithEmail, {});

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="email">Adresse email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>

      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <SubmitButton className="w-full">Se connecter</SubmitButton>

      <p className="text-center text-sm">
        <a
          href="/mot-de-passe-oublie"
          className="text-[color:var(--muted-foreground)] hover:underline"
        >
          Mot de passe oublie ?
        </a>
      </p>
    </form>
  );
}
