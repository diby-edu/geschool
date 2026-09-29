'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { RevealState } from '@/features/staff/actions';

/**
 * Remise en main propre des identifiants : le mot de passe temporaire n'est
 * affiché qu'UNE fois, dans cette carte, puis disparaît (rien n'est conservé :
 * ni en base, ni dans l'adresse, ni dans le journal).
 */
export function RevealCredentials({
  action,
  activated,
  name,
  schoolName,
}: {
  action: (prev: RevealState, formData: FormData) => Promise<RevealState>;
  /** L'accès est déjà actif : cela remplace le mot de passe personnel de la personne. */
  activated: boolean;
  name: string;
  schoolName: string;
}) {
  const [state, formAction] = useActionState<RevealState, FormData>(action, {});
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const c = state.credentials;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      /* presse-papiers indisponible : le texte reste sélectionnable à l'écran */
    }
  };

  if (c && !done) {
    const message =
      `[${schoolName}] Votre espace est disponible.\n` +
      `Code école : ${c.schoolCode}\n` +
      `Identifiant : ${c.identifier}\n` +
      `Mot de passe temporaire : ${c.password}\n` +
      `Connexion : ${c.loginUrl}\n` +
      `Vous devrez choisir votre mot de passe personnel à la première connexion.`;
    const rows: [string, string, string][] = [
      ['school', 'Code école', c.schoolCode],
      ['id', 'Identifiant', c.identifier],
      ['pw', 'Mot de passe temporaire', c.password],
    ];
    return (
      <div className="space-y-3 rounded-[--radius-card] border p-4" style={{ borderColor: 'var(--color-brand)' }}>
        <p className="text-sm font-semibold">Identifiants de {c.name || name}</p>
        <dl className="space-y-1.5">
          {rows.map(([key, label, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <dt className="text-sm text-[color:var(--muted-foreground)]">{label}</dt>
              <dd className="flex items-center gap-2">
                <span className="rounded bg-[color:var(--color-brand-muted)] px-2 py-1 font-mono text-sm tracking-wider select-all">
                  {value}
                </span>
                <button type="button" onClick={() => copy(key, value)} className="text-xs text-[color:var(--color-brand)] hover:underline">
                  {copied === key ? 'Copié' : 'Copier'}
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <Alert tone="info">
          Ce mot de passe n’est affiché <b>qu’une seule fois</b> : notez-le ou copiez le message maintenant. La personne
          devra choisir son propre mot de passe à sa première connexion.
          {c.replacedPersonalPassword ? ' Son ancien mot de passe personnel ne fonctionne plus.' : ''}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => copy('all', message)}>
            {copied === 'all' ? 'Message copié' : 'Copier le message complet'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setDone(true)}>
            J’ai transmis les identifiants
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {done ? <Alert tone="success">Identifiants transmis. Ils ne sont plus affichables.</Alert> : null}
      <form
        action={(fd) => {
          setDone(false);
          formAction(fd);
        }}
        onSubmit={(e) => {
          const message = activated
            ? `Remettre de nouveaux identifiants à ${name} ? Son mot de passe personnel actuel cessera de fonctionner.`
            : `Générer le mot de passe temporaire de ${name} ? Il ne sera affiché qu’une seule fois.`;
          if (!window.confirm(message)) e.preventDefault();
        }}
      >
        <SubmitButton variant="secondary" size="sm">
          {activated ? 'Remettre de nouveaux identifiants' : 'Afficher le mot de passe temporaire'}
        </SubmitButton>
      </form>
    </div>
  );
}
