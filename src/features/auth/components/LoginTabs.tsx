'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmailLoginForm } from './EmailLoginForm';
import { SchoolCodeLoginForm } from './SchoolCodeLoginForm';

type Tab = 'direction' | 'membres';

// Les onglets se choisissent par la FACON de se connecter, pas par la fonction : un
// membre du personnel cree avec son telephone (secretaire, censeur…) se connecte
// avec le code ecole, comme les enseignants et les parents ; seul un compte a
// adresse e-mail (le fondateur a l'inscription) passe par l'onglet e-mail.
const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'direction', label: 'Avec un e-mail', description: 'Fondateur et comptes créés avec une adresse e-mail.' },
  {
    id: 'membres',
    label: 'Avec le code école',
    description: 'Personnel, enseignants et parents : code de l’établissement, téléphone et mot de passe.',
  },
];

/**
 * Page de connexion unique. Deux familles d'utilisateurs, deux parcours :
 *   - Direction : email + mot de passe (comptes a email reel) ;
 *   - Enseignant / Parent : code ecole + telephone + mot de passe.
 */
export function LoginTabs({
  next,
  initialCode,
  initialTab,
}: {
  next?: string | undefined;
  initialCode: string;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>{current.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="tablist"
          aria-label="Type de compte"
          className="mb-5 grid grid-cols-2 gap-1 rounded-[--radius-card] border p-1 text-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className="rounded-[--radius-card] px-3 py-2 font-medium transition-colors focus-visible:outline-2"
                style={
                  active
                    ? { background: 'var(--color-brand)', color: '#fff' }
                    : { color: 'var(--muted-foreground)' }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'direction' ? (
          <EmailLoginForm next={next} />
        ) : (
          <SchoolCodeLoginForm initialCode={initialCode} next={next} />
        )}
      </CardContent>
    </Card>
  );
}
