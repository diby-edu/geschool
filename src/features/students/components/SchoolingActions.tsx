'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { LEAVE_STATUSES, LEAVE_REASONS, LEAVE_HINTS, type LeaveStatus } from '@/features/students/enrollment-changes-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Opt = { id: string; name: string };

/**
 * Changer de classe, ou enregistrer un départ.
 *
 * Deux gestes rares mais indispensables, repliés derrière un bouton : on ne les
 * met pas sous la main de qui consulte simplement une fiche.
 */
export function SchoolingActions({
  transferAction,
  withdrawAction,
  classes,
  currentClassId,
  today,
}: {
  transferAction: Action;
  withdrawAction: Action;
  classes: Opt[];
  currentClassId: string | null;
  today: string;
}) {
  const [panel, setPanel] = useState<'none' | 'transfer' | 'leave'>('none');
  const [transferState, transferForm] = useActionState<FormState, FormData>(transferAction, {});
  const [leaveState, leaveForm] = useActionState<FormState, FormData>(withdrawAction, {});
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>('TRANSFERRED_OUT');

  const others = classes.filter((c) => c.id !== currentClassId);

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === 'transfer' ? 'none' : 'transfer')}
            className="h-9 rounded-[--radius-card] border px-3 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            Changer de classe
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === 'leave' ? 'none' : 'leave')}
            className="h-9 rounded-[--radius-card] border px-3 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            Enregistrer un départ
          </button>
        </div>

        {panel === 'transfer' ? (
          <form action={transferForm} className="space-y-3 border-t pt-3">
            {transferState.error ? <Alert tone="error">{transferState.error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nouvelle classe" htmlFor="toClassId" required>
                <Select id="toClassId" name="toClassId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="À partir du" htmlFor="effectiveOn" required>
                <Input id="effectiveOn" name="effectiveOn" type="date" defaultValue={today} required />
              </Field>
            </div>
            <Field label="Motif" htmlFor="reason" hint="Facultatif — il reste dans le parcours de l’élève.">
              <Input id="reason" name="reason" maxLength={200} placeholder="Rééquilibrage des effectifs…" />
            </Field>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Ses notes et ses absences déjà prises ne bougent pas : elles appartiennent à l’élève, pas à la classe.
            </p>
            <SubmitButton>Changer de classe</SubmitButton>
          </form>
        ) : null}

        {panel === 'leave' ? (
          <form action={leaveForm} className="space-y-3 border-t pt-3">
            {leaveState.error ? <Alert tone="error">{leaveState.error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Motif du départ" htmlFor="leaveStatus" required>
                <Select
                  id="leaveStatus"
                  name="leaveStatus"
                  required
                  value={leaveStatus}
                  onChange={(e) => setLeaveStatus(e.target.value as LeaveStatus)}
                >
                  {LEAVE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LEAVE_REASONS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date du départ" htmlFor="leftOn" required>
                <Input id="leftOn" name="leftOn" type="date" defaultValue={today} required />
              </Field>
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">{LEAVE_HINTS[leaveStatus]}</p>
            <Field label="Précision" htmlFor="leaveReason" hint="Facultatif.">
              <Input id="leaveReason" name="leaveReason" maxLength={200} />
            </Field>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              L’inscription n’est pas effacée : elle porte les notes et les absences de l’année. Elle change d’état.
            </p>
            <SubmitButton variant="danger">Enregistrer le départ</SubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
