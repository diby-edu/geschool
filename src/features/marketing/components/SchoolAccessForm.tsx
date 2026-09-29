'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Les enseignants et les parents se connectent avec le code ecole (6 chiffres)
 * que leur communique l'etablissement. Ce formulaire ne fait que les envoyer
 * sur la page de connexion avec le code deja rempli : il ne consulte ni ne
 * liste aucun etablissement (le code n'est verifie qu'a la connexion).
 */
export function SchoolAccessForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = value.replace(/[\s.-]/g, '');
    if (!/^\d{6}$/.test(code)) {
      setError('Le code école comporte 6 chiffres. Demandez-le à votre établissement.');
      return;
    }
    setError(null);
    startTransition(() => router.push(`/login?code=${code}`));
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mkt-access-form">
        <input
          type="text"
          name="school-code"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Code de votre établissement (6 chiffres)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Code de votre établissement, 6 chiffres"
          aria-describedby={error ? 'mkt-access-error' : undefined}
        />
        <button type="submit" className="mkt-pill" disabled={pending}>
          {pending ? 'Ouverture…' : 'Continuer'}
        </button>
      </div>
      {error ? (
        <p id="mkt-access-error" className="mkt-access-error">{error}</p>
      ) : (
        <p className="mkt-access-note">
          Ce code vous a été communiqué par votre établissement (SMS).
        </p>
      )}
    </form>
  );
}
