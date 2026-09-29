'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { suggestLevelCode } from '../level-tree';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function CycleCreateForm({ action, schoolTracks = [] }: { action: Action; schoolTracks?: string[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un cycle</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_5rem]">
            <Field label="Code" htmlFor="c-code" required errors={err.code}>
              <Input id="c-code" name="code" required placeholder="SEC" />
            </Field>
            <Field label="Nom" htmlFor="c-name" required errors={err.name}>
              <Input id="c-name" name="name" required placeholder="Secondaire" />
            </Field>
            <Field label="Rang" htmlFor="c-seq" errors={err.sequence}>
              <Input id="c-seq" name="sequence" type="number" min="0" defaultValue="0" />
            </Field>
          </div>
          {schoolTracks.length > 1 ? (
            <Field
              label="Ce cycle appartient à"
              htmlFor="c-track"
              errors={err.track}
              hint="Parmi les ordres déjà choisis pour votre école (Paramètres → Identité). Ses classes suivront ce découpage : trimestres pour le général, semestres pour le technique et le professionnel."
            >
              <Select id="c-track" name="track" defaultValue={schoolTracks[0] ?? 'GENERAL'}>
                {schoolTracks.includes('GENERAL') ? <option value="GENERAL">Enseignement général</option> : null}
                {schoolTracks.includes('TECHNIQUE') ? <option value="TECHNIQUE">Enseignement technique</option> : null}
                {schoolTracks.includes('PROFESSIONNEL') ? <option value="PROFESSIONNEL">Formation professionnelle</option> : null}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="track" value={schoolTracks[0] ?? 'GENERAL'} />
          )}
          <SubmitButton size="sm">Ajouter le cycle</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

const DIPLOMAS = ['CQP', 'FQ', 'CAP', 'BEP', 'BT'] as const;

export function LevelCreateForm({
  action,
  cycles,
}: {
  action: Action;
  cycles: { id: string; name: string; track?: string | null }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  // Le code est proposé d'après le nom (« Terminale D » → « TLE-D »), comme les
  // niveaux officiels, et reste modifiable tant qu'on n'y a pas touché.
  const [cycleId, setCycleId] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const isPro = cycles.find((c) => c.id === cycleId)?.track === 'PROFESSIONNEL';
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un niveau</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Cycle" htmlFor="l-cycle" required errors={err.cycleId}>
            <Select id="l-cycle" name="cycleId" required value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="" disabled>
                — Choisir —
              </option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_5rem]">
            <Field label="Nom" htmlFor="l-name" required errors={err.name}>
              <Input
                id="l-name"
                name="name"
                required
                placeholder="Quatrième"
                onChange={(e) => {
                  if (!codeEdited) setCode(suggestLevelCode(e.target.value));
                }}
              />
            </Field>
            <Field
              label="Code"
              htmlFor="l-code"
              required
              errors={err.code}
              hint="Proposé d’après le nom. Il sert d’identifiant court dans les imports, les exports et les listes."
            >
              <Input
                id="l-code"
                name="code"
                required
                placeholder="4E"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeEdited(true);
                }}
              />
            </Field>
            <Field label="Rang" htmlFor="l-seq" errors={err.sequence}>
              <Input id="l-seq" name="sequence" type="number" min="0" defaultValue="0" />
            </Field>
          </div>
          {isPro ? (
            <Field
              label="Diplôme préparé"
              htmlFor="l-diploma"
              errors={err.diploma}
              hint="Range le niveau avec les autres du même diplôme, dans cette page comme sur les bulletins."
            >
              <Select id="l-diploma" name="diploma" defaultValue="">
                <option value="">— Aucun —</option>
                {DIPLOMAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <SubmitButton size="sm">Ajouter le niveau</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
