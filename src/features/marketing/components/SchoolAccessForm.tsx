'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Chaque etablissement a sa propre page de connexion (/e/{slug}/login),
 * dont l'adresse est communiquee par l'ecole (SMS, affichage, courrier). Ce
 * formulaire ne fait qu'y renvoyer a partir d'un identifiant fourni par le
 * parent ou l'eleve — il ne consulte ni ne liste aucun etablissement.
 */
export function SchoolAccessForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug.length < 3) {
      setError('Indiquez le nom ou le code communique par votre etablissement.');
      return;
    }
    setError(null);
    startTransition(() => router.push(`/e/${slug}/login`));
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mkt-access-form">
        <input
          type="text"
          name="school"
          placeholder="Nom ou code de votre etablissement"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Nom ou code de votre etablissement"
          aria-describedby={error ? 'mkt-access-error' : undefined}
        />
        <button type="submit" className="mkt-pill" disabled={pending}>
          {pending ? 'Recherche…' : 'Continuer'}
        </button>
      </div>
      {error ? (
        <p id="mkt-access-error" className="mkt-access-error">{error}</p>
      ) : (
        <p className="mkt-access-note">
          Cet identifiant vous a ete communique par votre etablissement (SMS ou courrier).
        </p>
      )}
    </form>
  );
}
