'use client';

import { useActionState, useState } from 'react';
import { blocksInput, describeBlocks } from '@/features/schedule/blocks';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateBlocksAction, updateRequirementAction, deleteRequirementAction } from '@/features/schedule/actions';
import type { FormState } from '@/lib/forms';

/** Salle précise (« R ») ou type de salle (« T ») proposé comme cible d'une règle. */
export type RoomChoice = { id: string; name: string; kind: 'ROOM' | 'TYPE' };

export type GenRow = {
  id: string;
  /** Classe(s) ou groupe du cours : « 3ème A », « Espagnol 4e ». */
  target: string;
  /** Rang du niveau, pour la couleur de la pastille. */
  levelRank: number;
  subject: string;
  teachers: string;
  hours: number;
  blocks: number[];
  /** La vraie salle : « Salle 12 » + « salle de la classe », « Terrain » + « imposé »… */
  room: { main: string; note: string };
  /** Règle de salle enregistrée, pour le formulaire « Modifier ». */
  roomMode: string;
  roomTarget: string;
  minCapacity: number | null;
  requiredFeatures: string[];
  status: string;
};

/** Une classe : ses lignes de la page, et ses totaux sur toute la liste filtrée (une classe peut être coupée par la page). */
export type GenGroup = { key: string; title: string; rows: GenRow[]; count: number; hours: number };

const ROOM_MODES = [
  { v: 'NONE', l: 'Salle de la classe (aucune règle)' },
  { v: 'PREFERRED', l: 'De préférence…' },
  { v: 'REQUIRED_ROOM', l: 'Obligatoirement…' },
];
const STATUSES = [
  { v: 'ACTIVE', l: 'À placer' },
  { v: 'IGNORED', l: 'Ignoré' },
  { v: 'DRAFT', l: 'Brouillon' },
  { v: 'SATISFIED', l: 'Déjà placé' },
];
/** Couleurs des niveaux, de la 6e à la Terminale (même suite que la maquette). */
const LEVEL_COLORS = ['#4a44e0', '#12a99b', '#d98a00', '#d64545', '#0891b2', '#8b5cf6', '#16a06a'];

/**
 * Enseignements de la page Générer (maquette validée le 2026-10-30) : une ligne
 * par enseignement, regroupés par classe. Le découpage se change dans la ligne ;
 * la salle et les autres réglages s'ouvrent avec « Modifier ».
 */
export function GenerateRequirements({
  slug,
  back,
  groups,
  canEdit,
  roomChoices,
  features,
}: {
  slug: string;
  /** Requête de la page (filtres, page) : on y revient après chaque enregistrement. */
  back: string;
  groups: GenGroup[];
  canEdit: boolean;
  roomChoices: RoomChoice[];
  features: { id: string; name: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)' }}>
            <th className="px-3 py-2.5">Classe</th>
            <th className="px-3 py-2.5">Matière</th>
            <th className="px-3 py-2.5">Enseignant</th>
            <th className="px-3 py-2.5">Heures / semaine</th>
            <th className="px-3 py-2.5">Découpage</th>
            <th className="px-3 py-2.5">Salle</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Group key={g.key} g={g} slug={slug} back={back} canEdit={canEdit} roomChoices={roomChoices} features={features} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({ g, ...rest }: { g: GenGroup; slug: string; back: string; canEdit: boolean; roomChoices: RoomChoice[]; features: { id: string; name: string }[] }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="border-t px-3 py-1.5 text-xs font-bold text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'var(--muted)', borderColor: 'var(--border)' }}>
          {g.title} · {g.count} matière{g.count > 1 ? 's' : ''} · {g.hours} h par semaine
        </td>
      </tr>
      {g.rows.map((r) => (
        <Row key={r.id} r={r} {...rest} />
      ))}
    </>
  );
}

function Row({ r, slug, back, canEdit, roomChoices, features }: { r: GenRow; slug: string; back: string; canEdit: boolean; roomChoices: RoomChoice[]; features: { id: string; name: string }[] }) {
  const color = LEVEL_COLORS[r.levelRank % LEVEL_COLORS.length]!;
  return (
    <tr className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
      <td className="px-3 py-2">
        <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: `${color}1a`, color }}>
          {r.target}
        </span>
      </td>
      <td className="px-3 py-2 font-semibold">{r.subject}</td>
      <td className="px-3 py-2 text-[color:var(--muted-foreground)]">{r.teachers}</td>
      <td className="whitespace-nowrap px-3 py-2">{r.hours} h</td>
      <td className="px-3 py-2">{canEdit ? <BlocksForm r={r} slug={slug} back={back} /> : describeBlocks(r.blocks)}</td>
      <td className="px-3 py-2">
        <div>
          <b>{r.room.main}</b> <span className="text-xs text-[color:var(--muted-foreground)]">{r.room.note}</span>
        </div>
        {canEdit ? <MoreForm r={r} slug={slug} back={back} roomChoices={roomChoices} features={features} /> : null}
      </td>
    </tr>
  );
}

function BlocksForm({ r, slug, back }: { r: GenRow; slug: string; back: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateBlocksAction.bind(null, slug, r.id), {});
  const initial = blocksInput(r.blocks);
  const [value, setValue] = useState(initial);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="back" value={back} />
      <div className="flex items-center gap-1.5">
        <input
          name="blocks"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Découpage ${r.subject} ${r.target}`}
          title="Durée de chaque cours de la semaine, en heures. 4 h : 1+1+1+1 (4 cours d’1 h), 2+2 (2 cours de 2 h), 3+1."
          className="h-8 w-24 rounded-lg border bg-[color:var(--surface)] px-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        />
        {value.trim() !== initial ? <SubmitButton size="sm">Enregistrer</SubmitButton> : null}
      </div>
      <div className="text-xs text-[color:var(--muted-foreground)]">{describeBlocks(r.blocks)}</div>
      {state.error ? <p className="text-xs font-semibold text-[color:var(--color-danger)]">{state.error}</p> : null}
    </form>
  );
}

function MoreForm({ r, slug, back, roomChoices, features }: { r: GenRow; slug: string; back: string; roomChoices: RoomChoice[]; features: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateRequirementAction.bind(null, slug, r.id), {});
  const err = state.fieldErrors ?? {};
  // « Obligatoirement » couvre salle ET type : le mode enregistré suit la cible.
  const [mode, setMode] = useState(r.roomMode === 'REQUIRED_TYPE' ? 'REQUIRED_ROOM' : r.roomMode);
  const types = roomChoices.filter((c) => c.kind === 'TYPE');
  const rooms = roomChoices.filter((c) => c.kind === 'ROOM');
  return (
    <details className="mt-0.5">
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-brand)]">Modifier</summary>
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--border)' }}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="blocks" value={blocksInput(r.blocks)} />
        {state.error ? (
          <div className="w-full">
            <Alert tone="error">{state.error}</Alert>
          </div>
        ) : null}
        <div className="w-52">
          <Field label="Où ?" htmlFor={`rm-${r.id}`}>
            <Select id={`rm-${r.id}`} name="roomMode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {ROOM_MODES.map((m) => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </Select>
          </Field>
        </div>
        {mode !== 'NONE' ? (
          <div className="w-52">
            <Field label="Quelle salle" htmlFor={`rt-${r.id}`}>
              <Select id={`rt-${r.id}`} name="roomTarget" defaultValue={r.roomTarget}>
                <option value="">— Choisir —</option>
                {types.length > 0 ? (
                  <optgroup label="Types de salle">
                    {types.map((c) => (
                      <option key={c.id} value={`T:${c.id}`}>{c.name}</option>
                    ))}
                  </optgroup>
                ) : null}
                {rooms.length > 0 ? (
                  <optgroup label="Salles précises">
                    {rooms.map((c) => (
                      <option key={c.id} value={`R:${c.id}`}>{c.name}</option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="w-28">
          <Field label="Capacité mini" htmlFor={`mc-${r.id}`} errors={err.minCapacity}>
            <Input id={`mc-${r.id}`} name="minCapacity" type="number" min="0" defaultValue={r.minCapacity === null ? '' : String(r.minCapacity)} />
          </Field>
        </div>
        <div className="w-32">
          <Field label="État" htmlFor={`st-${r.id}`}>
            <Select id={`st-${r.id}`} name="status" defaultValue={r.status}>
              {STATUSES.map((s) => (
                <option key={s.v} value={s.v}>{s.l}</option>
              ))}
            </Select>
          </Field>
        </div>
        {features.length > 0 ? (
          <details className="w-full">
            <summary className="cursor-pointer text-xs font-semibold text-[color:var(--muted-foreground)]">Équipements exigés ({r.requiredFeatures.length})</summary>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {features.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" name="requiredFeatures" value={f.id} defaultChecked={r.requiredFeatures.includes(f.id)} className="size-3.5" />
                  {f.name}
                </label>
              ))}
            </div>
          </details>
        ) : null}
        <SubmitButton variant="secondary" size="sm">Enregistrer</SubmitButton>
      </form>
      <div className="mt-1.5">
        <ConfirmSubmit
          action={deleteRequirementAction.bind(null, slug, r.id)}
          label="Supprimer cet enseignement"
          variant="secondary"
          hidden={{ back }}
          confirmMessage={`Supprimer « ${r.subject} — ${r.target} » des cours à placer ?`}
        />
      </div>
    </details>
  );
}
