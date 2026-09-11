'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { loginWithSchoolIdentifier, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';

export function SchoolLoginForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<AuthState, FormData>(loginWithSchoolIdentifier, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="identifier">Telephone, matricule ou email</Label>
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          autoFocus
          placeholder="Ex. 01 01 01 01 01"
        />
      </div>

      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <SubmitButton className="w-full">Se connecter</SubmitButton>
    </form>
  );
}
