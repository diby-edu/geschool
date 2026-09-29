'use client';

import { useActionState, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { planClasses, type NumberingKind } from '../naming';

export type CreateLevel = { id: string; code: string; name: string; track: string; diploma: string | null };

const TRACK_LABEL: Record<string, string> = {
  GENERAL: 'Enseignement général',
  TECHNIQUE: 'Enseignement technique',
  PROFESSIONNEL: 'Formation professionnelle',
};
const TRACK_ORDER = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];

/**
 * Nouvelle classe, ou toute une série d'un coup (« quinze sixièmes »).
 *
 * L'ordre d'enseignement ne sert qu'à filtrer les niveaux ; il disparaît quand
 * l'école n'en a qu'un. Les noms exacts sont montrés avant de valider : on ne
 * crée pas quinze classes à l'aveugle.
 */
export function ClassCreateForm({
  action,
  levels,
  teachers,
  rooms = [],
  schoolTracks,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  levels: CreateLevel[];
  teachers: { id: string; name: string }[];
  rooms?: { id: string; name: string }[];
  schoolTracks: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  const tracks = TRACK_ORDER.filter((t) => schoolTracks.includes(t) && levels.some((l) => l.track === t));
  const single = tracks.length <= 1;
  const [track, setTrack] = useState(single ? (tracks[0] ?? 'GENERAL') : '');
  const [levelId, setLevelId] = useState('');
  const [mode, setMode] = useState<'ONE' | 'MANY'>('ONE');
  const [suffix, setSuffix] = useState('');
  const [count, setCount] = useState('2');
  const [numbering, setNumbering] = useState<NumberingKind>('DIGITS');

  const shown = levels.filter((l) => l.track === track);
  const level = levels.find((l) => l.id === levelId);
  const plan = useMemo(
    () =>
      level
        ? planClasses({
            levelCode: level.code,
            levelName: level.name,
            mode,
            suffix,
            count: Number(count) || 0,
            numbering,
          })
        : [],
    [level, mode, suffix, count, numbering],
  );

  // Les niveaux du professionnel se rangent par diplôme, comme dans Structure.
  const groups = groupByDiploma(shown);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          {single ? null : (
            <Field label="Ordre d’enseignement" htmlFor="track" required>
              <Select
                id="track"
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value);
                  setLevelId('');
                }}
              >
                <option value="">— Sélectionner —</option>
                {tracks.map((t) => (
                  <option key={t} value={t}>
                    {TRACK_LABEL[t] ?? t}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="Niveau"
            htmlFor="levelId"
            required
            errors={err.levelId}
            hint={track ? undefined : 'Choisissez d’abord un ordre d’enseignement.'}
          >
            <Select
              id="levelId"
              name="levelId"
              required
              disabled={!track}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">— Sélectionner —</option>
              {groups.map((g) =>
                g.label ? (
                  <optgroup key={g.label} label={g.label}>
                    {g.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  g.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))
                ),
              )}
            </Select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              Mode <span className="text-[color:var(--color-danger)]">*</span>
            </legend>
            <input type="hidden" name="mode" value={mode} />
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeCard
                selected={mode === 'ONE'}
                title="Une classe"
                hint="Un suffixe, ou rien"
                onClick={() => setMode('ONE')}
              />
              <ModeCard
                selected={mode === 'MANY'}
                title="Plusieurs classes"
                hint="Suite numérotée"
                onClick={() => setMode('MANY')}
              />
            </div>
          </fieldset>

          {mode === 'ONE' ? (
            <Field
              label="Numéro ou lettre"
              htmlFor="suffix"
              errors={err.suffix}
              hint="Laissez vide si le niveau n’a qu’une seule classe."
            >
              <Input
                id="suffix"
                name="suffix"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="ex. 1, 2, A, B"
                maxLength={10}
              />
            </Field>
          ) : (
            <div className="space-y-4">
              <Field label="Nombre de classes" htmlFor="count" required errors={err.count}>
                <Input
                  id="count"
                  name="count"
                  type="number"
                  min="1"
                  max="60"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">
                  Type de numérotation <span className="text-[color:var(--color-danger)]">*</span>
                </legend>
                <input type="hidden" name="numbering" value={numbering} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <ModeCard
                    selected={numbering === 'DIGITS'}
                    title="Chiffres"
                    hint="1, 2, 3…"
                    onClick={() => setNumbering('DIGITS')}
                  />
                  <ModeCard
                    selected={numbering === 'LETTERS'}
                    title="Lettres"
                    hint="A, B, C…"
                    onClick={() => setNumbering('LETTERS')}
                  />
                </div>
              </fieldset>
            </div>
          )}

          {plan.length > 0 ? (
            <div className="space-y-2 rounded-2xl border p-3" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
              <Preview title={plan.length > 1 ? 'Noms courts' : 'Nom court'} items={plan.map((p) => p.code)} />
              <Preview title={plan.length > 1 ? 'Noms longs' : 'Nom long'} items={plan.map((p) => p.name)} />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Effectif maximum" htmlFor="capacity" required errors={err.capacity} hint="élèves">
              <Input id="capacity" name="capacity" type="number" min="0" max="500" defaultValue="40" required />
            </Field>
            {mode === 'ONE' ? (
              <Field label="Professeur principal" htmlFor="headTeacherId" errors={err.headTeacherId}>
                <Select id="headTeacherId" name="headTeacherId" defaultValue="">
                  <option value="">— Aucun —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          {mode === 'ONE' && rooms.length > 0 ? (
            <Field
              label="Salle habituelle"
              htmlFor="mainRoomId"
              errors={err.mainRoomId}
              hint="Facultatif : une classe peut changer de salle selon les cours."
            >
              <Select id="mainRoomId" name="mainRoomId" defaultValue="">
                <option value="">— Aucune —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <SubmitButton>{plan.length > 1 ? `Créer les ${plan.length} classes` : 'Créer la classe'}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function ModeCard({
  selected,
  title,
  hint,
  onClick,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-2xl border-2 px-4 py-3 text-center transition-colors"
      style={
        selected
          ? { borderColor: 'var(--color-brand)', backgroundColor: 'var(--color-brand-muted)' }
          : { backgroundColor: 'var(--surface)' }
      }
    >
      <span className="block text-sm font-bold" style={selected ? { color: 'var(--color-brand)' } : undefined}>
        {title}
      </span>
      <span className="block text-xs text-[color:var(--muted-foreground)]">{hint}</span>
    </button>
  );
}

/** Aperçu repliable : quinze noms ne doivent pas pousser le bouton hors de l'écran. */
function Preview({ title, items }: { title: string; items: string[] }) {
  return (
    <details open={items.length <= 6}>
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide">{title}</summary>
      <p className="mt-1 text-sm">{items.join(', ')}</p>
    </details>
  );
}

function groupByDiploma(levels: CreateLevel[]): { label: string | null; levels: CreateLevel[] }[] {
  if (levels.length === 0 || levels[0]!.track !== 'PROFESSIONNEL') return [{ label: null, levels }];
  const out: { label: string | null; levels: CreateLevel[] }[] = [];
  for (const l of levels) {
    const label = l.diploma ?? 'Autres';
    const found = out.find((g) => g.label === label);
    if (found) found.levels.push(l);
    else out.push({ label, levels: [l] });
  }
  return out;
}
