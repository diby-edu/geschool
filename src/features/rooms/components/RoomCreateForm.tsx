'use client';

import { useActionState, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { planRooms, roomCode, type NumberingKind } from '../naming';
import { CAPACITY_FREE_TYPES, ROOM_TYPE_SUGGESTIONS, type EducationTrack } from '../suggestions';
import { RoomTypeSelect, type ExistingType, type TypeChoice } from './RoomTypeSelect';

const TRACK_LABEL: Record<EducationTrack, string> = {
  GENERAL: 'Enseignement général',
  TECHNIQUE: 'Enseignement technique',
  PROFESSIONNEL: 'Formation professionnelle',
};

/**
 * Nouvelle salle, ou toute une série (« Salle 1 » à « Salle 10 »).
 *
 * Le code ne se saisit plus : il se déduit du nom, comme pour les niveaux et
 * les classes. Le type se choisit dans une liste unique et cherchable, qui
 * contient les types de l'école puis les types courants — en choisir un le crée.
 *
 * Les ordres d'enseignement de la salle sont repris de son type, puis
 * restreignables : « Atelier mécanique » vaut pour le technique et le
 * professionnel, mais VOTRE atelier n°2 peut ne servir qu'au professionnel.
 */
export function RoomCreateForm({
  action,
  roomTypes,
  features,
  schoolTracks,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roomTypes: ExistingType[];
  features: { id: string; name: string }[];
  /** Ordres de l'établissement : on ne propose rien qui n'existe pas chez lui. */
  schoolTracks: EducationTrack[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  const [baseName, setBaseName] = useState('');
  const [mode, setMode] = useState<'ONE' | 'MANY'>('ONE');
  const [count, setCount] = useState('10');
  const [numbering, setNumbering] = useState<NumberingKind>('DIGITS');
  const [startAt, setStartAt] = useState('1');

  // Les types et les suggestions que l'établissement peut voir, compte tenu de
  // ses ordres d'enseignement.
  // Quelques dizaines d'entrées : filtrer à chaque rendu coûte moins qu'un cache.
  const usable = (list: EducationTrack[]) => list.some((t) => schoolTracks.includes(t));
  const types = roomTypes.filter((t) => usable(t.tracks));
  const suggestions = ROOM_TYPE_SUGGESTIONS.filter((s) => usable(s.tracks));

  // « Salle de classe » d'emblée : c'est l'immense majorité des salles d'une
  // école, et « aucun type » ne veut rien dire pour l'emploi du temps.
  const [type, setType] = useState<TypeChoice>(() => {
    const own = types.find((t) => t.name.toLowerCase() === 'salle de classe');
    if (own) return { id: own.id, newName: '', tracks: own.tracks };
    const suggested = suggestions.find((s) => s.code === 'CLASSE');
    return { id: '', newName: suggested?.name ?? '', tracks: suggested?.tracks ?? schoolTracks };
  });

  /**
   * UN SEUL ordre coché par défaut : le premier que le type autorise chez cette
   * école, dans l'ordre général → technique → professionnel. Une salle de
   * classe est d'abord une salle du général ; si elle sert aussi ailleurs, on
   * coche en plus. Cocher les trois d'office reviendrait à proposer chaque
   * salle à tous les ordres sans que personne l'ait décidé.
   */
  const RANK: EducationTrack[] = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];
  const defaultTrack = (allowed: EducationTrack[]): EducationTrack[] => {
    const usable = RANK.filter((t) => schoolTracks.includes(t) && (allowed.length === 0 || allowed.includes(t)));
    const first = usable[0] ?? schoolTracks[0];
    return first ? [first] : [];
  };

  const [tracks, setTracks] = useState<EducationTrack[]>(() => defaultTrack([]));
  const chooseType = (choice: TypeChoice) => {
    setType(choice);
    setTracks(defaultTrack(choice.tracks));
  };
  const toggleTrack = (t: EducationTrack) =>
    setTracks((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const plan = useMemo(
    () =>
      planRooms({
        baseName,
        mode,
        count: Number(count) || 0,
        numbering,
        startAt: Number(startAt) || 1,
      }),
    [baseName, mode, count, numbering, startAt],
  );

  /**
   * Un terrain de sport ou un gymnase n'a pas de places assises : le champ
   * disparaît au lieu d'afficher « laissez 0 ». En base, 0 veut déjà dire
   * « aucune limite » pour le contrôle de capacité.
   */
  const typeName = type.newName || types.find((t) => t.id === type.id)?.name || '';
  const typeCode = ROOM_TYPE_SUGGESTIONS.find((s) => s.name === typeName)?.code ?? '';
  const sansCapacite = CAPACITY_FREE_TYPES.has(typeCode);

  // Le nom attendu dépend du type : « Salle 12 », mais « Terrain de football ».
  const placeholder = mode === 'MANY' ? (typeName || 'Salle') : typeName ? `${typeName} 1` : 'Salle 12';

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          {/*
            Le type d'abord : c'est lui qui décide du nom attendu, de la présence
            d'une capacité et des ordres d'enseignement proposés. Demander le nom
            avant reviendrait à faire saisir « Salle 12 » pour un terrain de sport.
          */}
          <div>
            <p className="mb-1 text-sm font-medium">
              Type de salle <span className="text-[color:var(--color-danger)]">*</span>
            </p>
            <RoomTypeSelect types={types} suggestions={suggestions} value={type} onChange={chooseType} />
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Sert de contrainte à l’emploi du temps : un TP peut exiger un laboratoire.
            </p>
          </div>

          <Field
            label="Nom"
            htmlFor="baseName"
            required
            errors={err.baseName}
            hint={`Le code est fabriqué à partir du nom : « ${placeholder} » donne ${roomCode(placeholder)}.`}
          >
            <Input
              id="baseName"
              name="baseName"
              required
              value={baseName}
              onChange={(e) => setBaseName(e.target.value)}
              placeholder={placeholder}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              Mode <span className="text-[color:var(--color-danger)]">*</span>
            </legend>
            <input type="hidden" name="mode" value={mode} />
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeCard selected={mode === 'ONE'} title="Une salle" hint="Le nom tel quel" onClick={() => setMode('ONE')} />
              <ModeCard
                selected={mode === 'MANY'}
                title="Plusieurs salles"
                hint="Suite numérotée"
                onClick={() => setMode('MANY')}
              />
            </div>
          </fieldset>

          {mode === 'MANY' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre" htmlFor="count" required errors={err.count}>
                <Input id="count" name="count" type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} />
              </Field>
              <Field label="Numérotation" htmlFor="numbering">
                <Select id="numbering" name="numbering" value={numbering} onChange={(e) => setNumbering(e.target.value as NumberingKind)}>
                  <option value="DIGITS">Chiffres (1, 2, 3…)</option>
                  <option value="LETTERS">Lettres (A, B, C…)</option>
                </Select>
              </Field>
              <Field label="Commencer à" htmlFor="startAt" hint="Utile pour compléter un bâtiment">
                <Input id="startAt" name="startAt" type="number" min="1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </Field>
            </div>
          ) : null}

          {plan.length > 0 ? (
            <div className="rounded-2xl border p-3 text-sm" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
              <p className="text-xs font-bold uppercase tracking-wide">
                {plan.length > 1 ? `${plan.length} salles seront créées` : 'Salle à créer'}
              </p>
              <p className="mt-1">{plan.map((r) => r.name).join(', ')}</p>
            </div>
          ) : null}

          {sansCapacite ? (
            <input type="hidden" name="capacity" value="0" />
          ) : (
            <div className="sm:max-w-xs">
              <Field label="Capacité" htmlFor="capacity" required errors={err.capacity} hint="Nombre de places assises">
                <Input id="capacity" name="capacity" type="number" min="0" max="2000" defaultValue="30" required />
              </Field>
            </div>
          )}

          {/* Un établissement mono-ordre n'a rien à choisir : la question ne se pose pas. */}
          {schoolTracks.length > 1 ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Ordres d’enseignement servis</legend>
              <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">
                Repris du type choisi. Décochez pour réserver ces salles à un seul ordre.
              </p>
              <input type="hidden" name="tracks" value={tracks.join(',')} />
              <div className="grid gap-2 sm:grid-cols-3">
                {schoolTracks.map((t) => (
                  <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tracks.includes(t)}
                      onChange={() => toggleTrack(t)}
                      className="size-4"
                    />
                    {TRACK_LABEL[t]}
                  </label>
                ))}
              </div>
              {tracks.length === 0 ? (
                <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--color-danger)' }}>
                  Choisissez au moins un ordre : une salle qui n’en sert aucun est inutilisable.
                </p>
              ) : null}
            </fieldset>
          ) : (
            <input type="hidden" name="tracks" value={schoolTracks.join(',')} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bâtiment" htmlFor="building" hint="Facultatif">
              <Input id="building" name="building" maxLength={60} placeholder="Bâtiment A" />
            </Field>
            <Field label="Étage" htmlFor="floor" hint="Facultatif">
              <Input id="floor" name="floor" maxLength={30} placeholder="Rez-de-chaussée" />
            </Field>
          </div>

          {features.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Équipements présents</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {features.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" name="features" value={f.id} className="size-4" />
                    {f.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <SubmitButton>{plan.length > 1 ? `Créer les ${plan.length} salles` : 'Créer la salle'}</SubmitButton>
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
