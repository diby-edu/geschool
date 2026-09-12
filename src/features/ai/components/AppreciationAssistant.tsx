'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/select';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Assistant d'appréciation (lot 13). « Proposer » génère un texte (règles par
 * défaut, LLM si configuré) que l'utilisateur relit et édite avant d'enregistrer
 * sur le bulletin. La proposition ne quitte jamais l'écran sans validation
 * humaine : l'IA suggère, l'enseignant décide.
 */
export function AppreciationAssistant({
  suggestAction,
  saveAction,
  initial,
}: {
  suggestAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  saveAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: string;
}) {
  const [suggestState, suggest] = useActionState<FormState, FormData>(suggestAction, {});
  const [saveState, save] = useActionState<FormState, FormData>(saveAction, {});

  const suggested = suggestState.values?.suggestion;
  const source = suggestState.values?.source;

  return (
    <div className="space-y-3">
      {suggestState.error ? <Alert tone="error">{suggestState.error}</Alert> : null}
      {saveState.error ? <Alert tone="error">{saveState.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <form action={suggest}>
          <SubmitButton variant="secondary" size="sm">Proposer une appréciation</SubmitButton>
        </form>
        {source ? (
          <span className="text-xs text-[color:var(--muted-foreground)]">
            {source === 'ai' ? 'Généré par l’assistant IA' : 'Généré automatiquement (règles)'} — à relire et ajuster.
          </span>
        ) : null}
      </div>

      <form action={save} className="space-y-2">
        <Textarea
          key={suggested ?? 'init'}
          name="appreciation"
          rows={4}
          defaultValue={suggested ?? initial}
          maxLength={2000}
          placeholder="Appréciation du professeur principal…"
        />
        <SubmitButton size="sm">Enregistrer l’appréciation</SubmitButton>
      </form>
    </div>
  );
}
