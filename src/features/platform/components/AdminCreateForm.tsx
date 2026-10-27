'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { CreateAdminState } from '../actions';

/**
 * Créer le compte d'un nouvel administrateur de la plateforme. Le mot de passe
 * temporaire s'affiche ici UNE fois : il n'est gardé nulle part ailleurs.
 */
export function AdminCreateForm({ action }: { action: (prev: CreateAdminState, formData: FormData) => Promise<CreateAdminState> }) {
  const [state, formAction] = useActionState<CreateAdminState, FormData>(action, {});

  if (state.done) {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <Alert tone="success">
            {state.done.tempPassword ? 'Compte créé : ' : 'Droits accordés au compte existant : '}
            <b>{state.done.email}</b> est maintenant administrateur de la plateforme.
          </Alert>
          {state.done.tempPassword ? (
            <>
              <p className="text-sm">Mot de passe temporaire, à remettre en main propre :</p>
              <p className="select-all rounded-xl border px-4 py-3 text-center font-mono text-2xl tracking-[0.2em]">{state.done.tempPassword}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Note-le maintenant : il ne sera plus affiché. À sa première connexion (« Avec un e-mail »), la personne choisira son propre mot de passe.
              </p>
            </>
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">Ce compte garde son mot de passe actuel.</p>
          )}
          <Link href="/admin/administrateurs" className="inline-block text-sm font-bold text-[color:var(--color-brand)] hover:underline">
            Revenir aux administrateurs
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="firstName" required>
              <Input id="firstName" name="firstName" required maxLength={60} autoComplete="off" />
            </Field>
            <Field label="Nom" htmlFor="lastName" required>
              <Input id="lastName" name="lastName" required maxLength={60} autoComplete="off" />
            </Field>
          </div>
          <Field label="E-mail" htmlFor="email" required hint="C'est l'identifiant de connexion. Si un compte existe déjà avec cet e-mail, il reçoit seulement les droits.">
            <Input id="email" name="email" type="email" required placeholder="nom@exemple.ci" autoComplete="off" />
          </Field>
          <Field label="Note" htmlFor="note" hint="Pourquoi, et pour combien de temps (facultatif)">
            <Input id="note" name="note" maxLength={120} placeholder="Associé, support technique…" />
          </Field>
          <SubmitButton size="sm">Créer le compte Super Admin</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
