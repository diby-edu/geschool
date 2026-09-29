'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { setSchoolStatusAction } from '../actions';
import type { SchoolStatus } from '../admin';

const NEXT: Record<string, { status: SchoolStatus; label: string; hint: string }[]> = {
  PENDING: [
    { status: 'ACTIVE', label: 'Activer', hint: 'L’établissement peut travailler normalement.' },
    { status: 'ARCHIVED', label: 'Archiver', hint: 'Dossier clos, consultation seule.' },
  ],
  ACTIVE: [
    { status: 'SUSPENDED', label: 'Suspendre', hint: 'Plus aucune écriture, les données restent.' },
    { status: 'ARCHIVED', label: 'Archiver', hint: 'Dossier clos, consultation seule.' },
  ],
  SUSPENDED: [
    { status: 'ACTIVE', label: 'Réactiver', hint: 'L’établissement retrouve tout.' },
    { status: 'ARCHIVED', label: 'Archiver', hint: 'Dossier clos, consultation seule.' },
  ],
  ARCHIVED: [{ status: 'ACTIVE', label: 'Rouvrir', hint: 'L’établissement redevient actif.' }],
};

/** Changer l'état d'un établissement, avec un motif qui reste au journal. */
export function SchoolStatusForm({ schoolId, current }: { schoolId: string; current: string }) {
  const choices = NEXT[current] ?? [];
  return (
    <div className="space-y-2">
      {choices.map((c) => (
        <StatusAction key={c.status} schoolId={schoolId} status={c.status} label={c.label} hint={c.hint} />
      ))}
    </div>
  );
}

function StatusAction({
  schoolId,
  status,
  label,
  hint,
}: {
  schoolId: string;
  status: SchoolStatus;
  label: string;
  hint: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setSchoolStatusAction.bind(null, schoolId, status),
    {},
  );
  return (
    <Card>
      <CardContent className="py-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <form action={formAction} className="flex flex-wrap items-end justify-between gap-3">
          <span className="text-sm">
            <span className="font-medium">{label}</span>
            <br />
            <span className="text-xs text-[color:var(--muted-foreground)]">{hint}</span>
          </span>
          <span className="flex items-center gap-2">
            <Input name="reason" placeholder="Motif (facultatif)" maxLength={120} className="w-52" />
            <SubmitButton size="sm" variant={status === 'ACTIVE' ? 'primary' : 'secondary'}>
              {label}
            </SubmitButton>
          </span>
        </form>
      </CardContent>
    </Card>
  );
}
