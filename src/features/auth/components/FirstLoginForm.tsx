'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { completeFirstLogin, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';

export function FirstLoginForm() {
  const [state, action] = useActionState<AuthState, FormData>(completeFirstLogin, {});

  return (
    <form noValidate action={action} className="space-y-4">
      {/* noValidate : sur téléphone, la bulle « Veuillez renseigner ce champ »
          s'affiche derrière le clavier et disparaît aussitôt — on a l'impression
          que le bouton ne fait rien. Le serveur renvoie le même contrôle, et son
          message s'affiche en clair, amené sous les yeux. */}
      <FormError message={state.error} />

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

      <SubmitButton className="w-full">Définir mon mot de passe</SubmitButton>
    </form>
  );
}
