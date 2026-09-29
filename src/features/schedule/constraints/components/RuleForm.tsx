'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import {
  CONSTRAINT_CATALOG,
  FAMILIES,
  FAMILY_LABELS,
  SCOPE_LABELS,
  SEVERITY_LABELS,
  describeRule,
  validateParams,
  type ConstraintDef,
  type ConstraintScope,
  type ParamValues,
  type Severity,
} from '../catalog';

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
];

export type TargetLists = Record<Exclude<ConstraintScope, 'SCHOOL'>, { id: string; name: string }[]>;

/**
 * Ajouter une règle d'emploi du temps.
 *
 * Le formulaire est entièrement piloté par le catalogue : on choisit une règle,
 * et ses champs apparaissent. Ajouter une règle au catalogue suffit donc à la
 * rendre saisissable — il n'y a pas d'écran à écrire par règle.
 *
 * La phrase récapitulative en bas se met à jour en direct. Une règle qu'on ne
 * sait pas relire est une règle qu'on n'ose pas enregistrer.
 */
export function RuleForm({
  action,
  targets,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  targets: TargetLists;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const [code, setCode] = useState(CONSTRAINT_CATALOG[0]!.code);
  const def: ConstraintDef = CONSTRAINT_CATALOG.find((c) => c.code === code) ?? CONSTRAINT_CATALOG[0]!;

  const [scope, setScope] = useState<ConstraintScope>(def.scopes[0]!);
  const [scopeId, setScopeId] = useState('');
  const [severity, setSeverity] = useState<Severity>(def.defaultSeverity);
  const [weight, setWeight] = useState('10');
  const [params, setParams] = useState<ParamValues>({});

  /** Changer de règle remet à zéro : ses champs et ses portées ne sont pas les mêmes. */
  const chooseRule = (next: string) => {
    const d = CONSTRAINT_CATALOG.find((c) => c.code === next);
    if (!d) return;
    setCode(next);
    setScope(d.scopes[0]!);
    setScopeId('');
    setSeverity(d.defaultSeverity);
    setParams({});
  };

  const setParam = (key: string, value: unknown) => setParams((p) => ({ ...p, [key]: value }));

  const toggleDay = (key: string, day: number) => {
    const list = Array.isArray(params[key]) ? ([...(params[key] as number[])]) : [];
    setParam(key, list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort());
  };

  const problems = validateParams(def, params);
  const targetList = scope === 'SCHOOL' ? [] : targets[scope];
  const needsTarget = scope !== 'SCHOOL';

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="scopeType" value={scope} />
          <input type="hidden" name="severity" value={severity} />
          <input type="hidden" name="params" value={JSON.stringify(params)} />

          <Field label="Règle" htmlFor="rule" required hint={def.description}>
            <Select id="rule" value={code} onChange={(e) => chooseRule(e.target.value)}>
              {FAMILIES.map((family) => (
                <optgroup key={family} label={FAMILY_LABELS[family]}>
                  {CONSTRAINT_CATALOG.filter((c) => c.family === family).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <p className="rounded-2xl border p-3 text-xs" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
            <span className="font-semibold">Par exemple :</span> {def.example}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Porte sur" htmlFor="scope" required>
              <Select
                id="scope"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as ConstraintScope);
                  setScopeId('');
                }}
              >
                {def.scopes.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>

            {needsTarget ? (
              <Field label="Lequel" htmlFor="scopeId" required>
                <Select id="scopeId" name="scopeId" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                  <option value="">— Choisir —</option>
                  {targetList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          {/* Les champs de la règle choisie. */}
          {def.params.map((spec) => {
            if (spec.kind === 'DAYS') {
              const list = Array.isArray(params[spec.key]) ? (params[spec.key] as number[]) : [];
              return (
                <fieldset key={spec.key}>
                  <legend className="mb-1 text-sm font-medium">
                    {spec.label}
                    {spec.required ? <span className="text-[color:var(--color-danger)]"> *</span> : null}
                  </legend>
                  {spec.hint ? <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">{spec.hint}</p> : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {DAYS.map((d) => (
                      <label key={d.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={list.includes(d.value)}
                          onChange={() => toggleDay(spec.key, d.value)}
                          className="size-4"
                        />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }

            if (spec.kind === 'TIME_RANGE') {
              const r = (params[spec.key] ?? {}) as { from?: string; to?: string };
              return (
                <div key={spec.key}>
                  <p className="mb-1 text-sm font-medium">{spec.label}</p>
                  {spec.hint ? <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">{spec.hint}</p> : null}
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={r.from ?? ''}
                      onChange={(e) => setParam(spec.key, { ...r, from: e.target.value })}
                      aria-label="Heure de début"
                      className="max-w-36"
                    />
                    <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                    <Input
                      type="time"
                      value={r.to ?? ''}
                      onChange={(e) => setParam(spec.key, { ...r, to: e.target.value })}
                      aria-label="Heure de fin"
                      className="max-w-36"
                    />
                  </div>
                </div>
              );
            }

            if (spec.kind === 'SESSIONS') {
              return (
                <div key={spec.key} className="sm:max-w-xs">
                  <Field label={spec.label} htmlFor={spec.key} required={spec.required} hint={spec.hint}>
                    <Input
                      id={spec.key}
                      type="number"
                      min={spec.min}
                      max={spec.max}
                      value={String(params[spec.key] ?? '')}
                      onChange={(e) => setParam(spec.key, e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </Field>
                </div>
              );
            }

            if (spec.kind === 'DAY_PART') {
              return (
                <div key={spec.key} className="sm:max-w-xs">
                  <Field label={spec.label} htmlFor={spec.key} required={spec.required} hint={spec.hint}>
                    <Select
                      id={spec.key}
                      value={String(params[spec.key] ?? '')}
                      onChange={(e) => setParam(spec.key, e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      <option value="MORNING">Le matin</option>
                      <option value="AFTERNOON">L’après-midi</option>
                    </Select>
                  </Field>
                </div>
              );
            }

            return (
              <Field key={spec.key} label={spec.label} htmlFor={spec.key} required={spec.required} hint={spec.hint}>
                <Input
                  id={spec.key}
                  maxLength={spec.max}
                  value={String(params[spec.key] ?? '')}
                  onChange={(e) => setParam(spec.key, e.target.value)}
                />
              </Field>
            );
          })}

          {/* Sévérité : c'est l'école qui tranche, pas le catalogue. */}
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Cette règle est…</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {def.severities.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  aria-pressed={severity === s}
                  className="rounded-2xl border-2 px-4 py-3 text-left transition-colors"
                  style={
                    severity === s
                      ? { borderColor: 'var(--color-brand)', backgroundColor: 'var(--color-brand-muted)' }
                      : { backgroundColor: 'var(--surface)' }
                  }
                >
                  <span className="block text-sm font-bold" style={severity === s ? { color: 'var(--color-brand)' } : undefined}>
                    {SEVERITY_LABELS[s]}
                  </span>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">
                    {s === 'HARD'
                      ? 'Jamais violée. Si c’est impossible, la génération le dit.'
                      : 'Respectée si possible, sacrifiée si nécessaire.'}
                  </span>
                </button>
              ))}
            </div>
            {def.severities.length === 1 ? (
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Cette règle ne peut être qu’une préférence : l’imposer rendrait presque toute génération impossible.
              </p>
            ) : null}
          </fieldset>

          {severity === 'SOFT' ? (
            <div className="sm:max-w-xs">
              <Field label="Importance" htmlFor="weight" hint="De 1 à 100. Plus c’est haut, plus le générateur y tient.">
                <Input
                  id="weight"
                  name="weight"
                  type="number"
                  min="1"
                  max="100"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <div className="rounded-2xl border p-3 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
            <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Règle enregistrée
            </p>
            <p className="mt-1">
              {describeRule(def, params)}
              {needsTarget && scopeId ? ` · ${targetList.find((t) => t.id === scopeId)?.name ?? ''}` : ''}
              {scope === 'SCHOOL' ? ' · tout l’établissement' : ''} ·{' '}
              <span className="font-semibold">{SEVERITY_LABELS[severity].toLowerCase()}</span>
            </p>
            {problems.length > 0 ? (
              <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--color-danger)' }}>
                {problems.map((p) => p.message).join(' ')}
              </p>
            ) : null}
          </div>

          <SubmitButton>Ajouter la règle</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
