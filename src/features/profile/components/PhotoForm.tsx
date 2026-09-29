'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/** Choix et envoi de sa photo de profil, avec aperçu avant envoi. */
export function PhotoForm({
  action,
  photoUrl,
  name,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  photoUrl: string | null;
  name: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [preview, setPreview] = useState<string | null>(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  const shown = preview ?? photoUrl;

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex items-center gap-4">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée (stockage privé) ou aperçu local
          <img src={shown} alt="Votre photo" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-full text-xl font-extrabold" style={{ backgroundColor: 'var(--color-brand-muted)', color: 'var(--color-brand)' }}>
            {initials}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
            className="block w-full text-sm"
            aria-label="Choisir une photo"
          />
          <p className="text-xs text-[color:var(--muted-foreground)]">JPEG, PNG ou WebP · 2 Mo maximum.</p>
        </div>
      </div>
      <SubmitButton size="sm">Enregistrer la photo</SubmitButton>
    </form>
  );
}
