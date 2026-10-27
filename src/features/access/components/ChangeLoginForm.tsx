'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Corriger le numéro ou l'e-mail de connexion (0147) : un bouton qui ouvre un
 * petit champ, puis enregistre. La personne se connecte ensuite avec le nouvel
 * identifiant ; son mot de passe ne change pas.
 */
export function ChangeLoginForm({
  action,
  current,
  byPhone,
  small = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** L'identifiant actuel, tel qu'affiché. */
  current: string;
  byPhone: boolean;
  small?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size={small ? 'sm' : 'md'} onClick={() => setOpen(true)}>
        {byPhone ? 'Corriger le numéro' : 'Corriger l’e-mail'}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-2 text-left">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className="text-xs font-medium">
        {byPhone ? 'Nouveau numéro' : 'Nouvel e-mail'} <span className="text-[color:var(--muted-foreground)]">(actuel : {current})</span>
      </label>
      <Input
        name="identifier"
        required
        autoFocus
        inputMode={byPhone ? 'tel' : 'email'}
        type={byPhone ? 'tel' : 'email'}
        placeholder={byPhone ? '07 00 00 00 00' : 'nom@exemple.ci'}
      />
      <p className="text-xs text-[color:var(--muted-foreground)]">Son mot de passe ne change pas.</p>
      <div className="flex gap-2">
        <SubmitButton size="sm">Enregistrer</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
