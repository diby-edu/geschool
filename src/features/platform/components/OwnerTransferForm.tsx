'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { OwnerState } from '../school-sheet-actions';

/**
 * Changer le responsable (fondateur) d'une école : un membre existant, ou un
 * nouvel e-mail. Au choix, l'ancien responsable perd le rôle de fondateur
 * (il garde ses autres fonctions). Décidé le 2026-10-25.
 */
export function OwnerTransferForm({
  action,
  members,
  foundersAlone,
  schoolId,
}: {
  action: (prev: OwnerState, fd: FormData) => Promise<OwnerState>;
  members: { userId: string; name: string; functions: string }[];
  /** Fondateurs actuels sans autre fonction : la case leur retire tout accès. */
  foundersAlone: string[];
  schoolId: string;
}) {
  const [state, formAction] = useActionState<OwnerState, FormData>(action, {});
  const [mode, setMode] = useState<'member' | 'new'>('member');

  if (state.done) {
    return (
      <div className="space-y-3">
        <Alert tone="success">
          Responsable changé{state.done.email ? ` : ${state.done.email}` : ''}.
          {state.done.removed > 0 ? ` L’ancien responsable n’a plus le rôle de fondateur (${state.done.removed}).` : ''}
        </Alert>
        {state.done.tempPassword ? (
          <>
            <p className="text-sm">Compte créé. Mot de passe temporaire, à remettre en main propre :</p>
            <p className="select-all rounded-xl border px-4 py-3 text-center font-mono text-2xl tracking-[0.2em]">{state.done.tempPassword}</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Note-le maintenant : il ne sera plus affiché. À la première connexion (« Avec un e-mail »), la personne choisira le sien.
            </p>
          </>
        ) : null}
        <Link href={`/admin/etablissements/${schoolId}?onglet=personnes`} className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">
          Voir les personnes de l’école
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="member" checked={mode === 'member'} onChange={() => setMode('member')} />
          Un membre de l’école
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')} />
          Une nouvelle personne (e-mail)
        </label>
      </div>

      {mode === 'member' ? (
        <Field label="Nouveau responsable" htmlFor="userId" required>
          <select id="userId" name="userId" required className="h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm">
            <option value="">— Choisir —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
                {m.functions ? ` — ${m.functions}` : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Prénom" htmlFor="firstName" required>
            <Input id="firstName" name="firstName" required maxLength={60} />
          </Field>
          <Field label="Nom" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" required maxLength={60} />
          </Field>
          <Field label="E-mail" htmlFor="ownerEmail" required>
            <Input id="ownerEmail" name="email" type="email" required placeholder="nom@exemple.ci" />
          </Field>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="removeOld" className="mt-1" />
        <span>
          Retirer le rôle de fondateur à l’ancien responsable <span className="text-[color:var(--muted-foreground)]">(il garde ses autres fonctions)</span>
        </span>
      </label>
      {foundersAlone.length > 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Attention : {foundersAlone.join(', ')} n’a pas d’autre fonction. Si la case est cochée, cette personne n’aura plus aucun accès à
          l’école (elle restera dans la liste ci-dessus, « aucune fonction », pour la redésigner).
        </p>
      ) : null}
      <SubmitButton size="sm">Changer de responsable</SubmitButton>
    </form>
  );
}
