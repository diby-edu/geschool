'use client';

import { useActionState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { loginWithEmail, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';

export function EmailLoginForm({ next }: { next?: string | undefined }) {
  const [state, action] = useActionState<AuthState, FormData>(loginWithEmail, {});

  return (
    <form noValidate action={action} className="space-y-4">
      {/* noValidate : sur téléphone, la bulle « Veuillez renseigner ce champ »
          s'affiche derrière le clavier et disparaît aussitôt — on a l'impression
          que le bouton ne fait rien. Le serveur renvoie le même contrôle, et son
          message s'affiche en clair, amené sous les yeux. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError message={state.error} />

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
