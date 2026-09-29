'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { loginWithSchoolIdentifier, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';

export function SchoolLoginForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<AuthState, FormData>(loginWithSchoolIdentifier, {});

  return (
    <form noValidate action={action} className="space-y-4">
      {/* noValidate : sur téléphone, la bulle « Veuillez renseigner ce champ »
          s'affiche derrière le clavier et disparaît aussitôt — on a l'impression
          que le bouton ne fait rien. Le serveur renvoie le même contrôle, et son
          message s'affiche en clair, amené sous les yeux. */}
      <input type="hidden" name="slug" value={slug} />

      <FormError message={state.error} />

      <div>
        <Label htmlFor="identifier">Téléphone ou email</Label>
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          autoFocus
          placeholder="Ex. 07 00 00 00 00"
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
