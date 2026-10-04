'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { reasonsProblem, type GapReason } from '@/features/attendance/gap-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

type Ligne = GapReason & { cle: string };

/**
 * Les motifs d'un appel non fait.
 *
 * Liste ouverte : la notre est un point de depart, chaque etablissement la
 * complete ou la renomme. Effacer un libelle retire le motif.
 */
export function GapReasonsForm({ action, reasons }: { action: Action; reasons: GapReason[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lignes, setLignes] = useState<Ligne[]>(() => reasons.map((r, i) => ({ ...r, cle: r.code || `n${i}` })));

  const probleme = reasonsProblem(lignes.filter((l) => l.label.trim()));

  const majLigne = (cle: string, patch: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <p className="text-sm font-semibold">Motifs d’un appel non fait</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Ce qu’on pourra répondre devant un cours sans appel. Effacez un libellé pour retirer le motif ; cochez la
          case quand le motif met l’enseignant en cause — c’est le seul effet, l’application n’en tire aucune
          conclusion.
        </p>
      </div>

      <ul className="space-y-2">
        {lignes.map((l, i) => (
          <li key={l.cle} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="reasonCode" value={l.code} />
            <input
              name="reasonLabel"
              value={l.label}
              onChange={(e) => majLigne(l.cle, { label: e.target.value })}
              maxLength={80}
              placeholder="Libellé du motif"
              className="min-w-[16rem] flex-1 rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Motif ${i + 1}`}
            />
            <label className="flex items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]">
              <input
                type="checkbox"
                name="reasonBlames"
                value={String(i)}
                checked={l.blamesTeacher === true}
                onChange={(e) => majLigne(l.cle, { blamesTeacher: e.target.checked })}
              />
              met l’enseignant en cause
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setLignes((ls) => [...ls, { code: '', label: '', cle: `n${Date.now()}` }])
          }
        >
          Ajouter un motif
        </Button>
        <SubmitButton>Enregistrer les motifs</SubmitButton>
      </div>

      {probleme ? <p className="text-xs text-[color:var(--color-danger)]">{probleme}</p> : null}
    </form>
  );
}
