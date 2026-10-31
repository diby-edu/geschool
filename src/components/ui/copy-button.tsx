'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copier une valeur (identifiant de connexion) d'un clic ; coche verte une seconde et demie. */
export function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} : ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="ml-1 inline-flex align-middle text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
    >
      {done ? <Check className="h-3.5 w-3.5 text-[color:var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
