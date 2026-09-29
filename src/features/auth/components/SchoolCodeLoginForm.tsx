'use client';

import { useActionState, useState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { loginWithSchoolCode, type AuthState } from '../actions';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';

/**
 * Connexion des enseignants et des parents : code ecole + telephone (ou email)
 * + mot de passe. Les champs sont controles pour survivre a la reinitialisation
 * du formulaire que React applique apres une action en erreur : l'utilisateur
 * ne doit ressaisir que son mot de passe.
 */
export function SchoolCodeLoginForm({ initialCode, next }: { initialCode: string; next?: string | undefined }) {
  const [state, action] = useActionState<AuthState, FormData>(loginWithSchoolCode, {});
  const [code, setCode] = useState(initialCode);
  const [identifier, setIdentifier] = useState('');

  return (
    <form noValidate action={action} className="space-y-4">
      {/* noValidate : sur téléphone, la bulle « Veuillez renseigner ce champ »
          s'affiche derrière le clavier et disparaît aussitôt — on a l'impression
          que le bouton ne fait rien. Le serveur renvoie le même contrôle, et son
          message s'affiche en clair, amené sous les yeux. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError message={state.error} />

      <div>
        <Label htmlFor="code">Code école</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          required
          autoFocus={initialCode === ''}
          placeholder="Ex. 482913"
          maxLength={9}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          6 chiffres, communiqués par votre établissement (SMS).
        </p>
      </div>

      <div>
        <Label htmlFor="identifier">Téléphone ou email</Label>
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          autoFocus={initialCode !== ''}
          placeholder="Ex. 07 00 00 00 00"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
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
