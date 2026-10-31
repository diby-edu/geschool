'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Tier = { minPct: number; discountPct: number };

const field = 'h-9 w-24 rounded-xl border bg-[color:var(--surface)] px-2.5 text-sm';

/** Les deux paliers de réduction (le second facultatif). */
function TierInputs({ tiers }: { tiers: Tier[] }) {
  return (
    <div className="space-y-2 text-sm">
      {[1, 2].map((i) => {
        const t = tiers[i - 1];
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-16 font-semibold">Palier {i}</span>
            Si au moins
            <input name={`min${i}`} defaultValue={t?.minPct ?? ''} inputMode="decimal" className={field} style={{ borderColor: 'var(--border)' }} aria-label={`Palier ${i} : pourcentage d’élèves activés`} />
            % des élèves sont activés →
            <input name={`pct${i}`} defaultValue={t?.discountPct ?? ''} inputMode="decimal" className={field} style={{ borderColor: 'var(--border)' }} aria-label={`Palier ${i} : pourcentage de réduction`} />
            % de réduction{i === 2 ? <span className="text-xs text-[color:var(--muted-foreground)]"> (facultatif)</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Prix et paliers pour toutes les écoles. */
export function DefaultsForm({ action, price, tiers }: { action: (p: FormState, fd: FormData) => Promise<FormState>; price: number; tiers: Tier[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Prix par enfant et par année scolaire</span>
        <input name="price" defaultValue={price} inputMode="numeric" className={field} style={{ borderColor: 'var(--border)' }} required />
        F
      </label>
      <div>
        <p className="mb-1.5 text-sm font-semibold">Réduction pour l’école, sur son prochain abonnement</p>
        <TierInputs tiers={tiers} />
      </div>
      <SubmitButton size="sm">Enregistrer</SubmitButton>
    </form>
  );
}

/** Règle propre à une école (prix négocié, offert, ou d'autres paliers). */
export function SchoolRuleForm({
  action,
  schools,
  initial,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  schools: { id: string; name: string }[];
  initial?: { schoolId: string; price: number | null; tiers: Tier[] } | undefined;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select name="school" defaultValue={initial?.schoolId ?? ''} className="h-9 min-w-56 rounded-xl border bg-[color:var(--surface)] px-2.5" style={{ borderColor: 'var(--border)' }} required>
          <option value="" disabled>
            Choisir une école…
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        Prix
        <input name="price" defaultValue={initial?.price ?? ''} placeholder="comme toutes" inputMode="numeric" className={`${field} w-28`} style={{ borderColor: 'var(--border)' }} />
        F <span className="text-xs text-[color:var(--muted-foreground)]">(0 = offert ; vide = prix de toutes les écoles)</span>
      </div>
      <TierInputs tiers={initial?.tiers ?? []} />
      <p className="text-xs text-[color:var(--muted-foreground)]">Paliers vides = ceux de toutes les écoles.</p>
      <SubmitButton size="sm">Enregistrer la règle</SubmitButton>
    </form>
  );
}
