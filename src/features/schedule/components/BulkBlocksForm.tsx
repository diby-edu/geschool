'use client';

import { useActionState, useState } from 'react';
import { parseBlocks, describeBlocks, totalHours } from '@/features/schedule/blocks';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { applyBlocksAction } from '@/features/schedule/actions';
import type { FormState } from '@/lib/forms';

/** Pour chaque matière d'un niveau : combien de classes, et leurs heures par semaine. */
export type BulkTarget = { subjectId: string; levelId: string; classes: number; hours: number[] };

/**
 * « Découper en une fois » (maquette validée le 2026-10-30) : le même découpage
 * pour une matière dans toutes les classes d'un niveau. L'aperçu dit avant
 * d'enregistrer combien de classes changent, ou pourquoi ça ne tombe pas juste.
 */
export function BulkBlocksForm({
  slug,
  back,
  subjects,
  levels,
  targets,
}: {
  slug: string;
  back: string;
  subjects: { id: string; name: string }[];
  levels: { id: string; name: string }[];
  targets: BulkTarget[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(applyBlocksAction.bind(null, slug), {});
  const [subject, setSubject] = useState(subjects[0]?.id ?? '');
  const [level, setLevel] = useState(levels[0]?.id ?? '');
  const [raw, setRaw] = useState('');

  const subjectName = subjects.find((s) => s.id === subject)?.name ?? '';
  const levelName = levels.find((l) => l.id === level)?.name ?? '';
  const target = targets.find((t) => t.subjectId === subject && t.levelId === level);
  const parsed = parseBlocks(raw);

  let preview: { ok: boolean; text: string; neutral?: boolean };
  if (!raw.trim())
    preview = {
      ok: false,
      neutral: true,
      text: target ? `${subjectName} en ${levelName} : ${[...new Set(target.hours)].join(' ou ')} h par semaine. Saisissez le découpage, par exemple 2+2.` : 'Choisissez la matière et le niveau.',
    };
  else if (!target) preview = { ok: false, text: `${subjectName} n’a aucun enseignement en ${levelName}.` };
  else if (!parsed.ok) preview = { ok: false, text: parsed.error };
  else {
    const total = totalHours(parsed.blocks);
    const fit = target.hours.filter((h) => h === total).length;
    const hours = [...new Set(target.hours)].join(' ou ');
    preview =
      fit === 0
        ? { ok: false, text: `${raw} = ${total} h, mais ${subjectName} en ${levelName} a ${hours} h par semaine au programme.` }
        : {
            ok: true,
            text: `${fit} classe${fit > 1 ? 's' : ''} de ${levelName} : ${subjectName}, ${total} h par semaine → ${describeBlocks(parsed.blocks)}${
              fit < target.classes ? ` (${target.classes - fit} autre${target.classes - fit > 1 ? 's' : ''} à un autre volume, inchangée${target.classes - fit > 1 ? 's' : ''})` : ''
            }`,
          };
  }

  const control = 'h-9 rounded-xl border bg-[color:var(--surface)] px-2.5 text-sm text-[color:var(--foreground)]';
  return (
    <form action={formAction} className="rounded-2xl border px-4 py-3.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
      <input type="hidden" name="back" value={back} />
      <div className="font-bold">Découper en une fois</div>
      <p className="mb-2.5 text-xs text-[color:var(--muted-foreground)]">
        Le même découpage pour une matière dans toutes les classes d’un niveau, au lieu de le saisir classe par classe.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
          Matière
          <select name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={control} style={{ borderColor: 'var(--border)' }}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
          Niveau
          <select name="level" value={level} onChange={(e) => setLevel(e.target.value)} className={control} style={{ borderColor: 'var(--border)' }}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
          Découpage
          <input name="blocks" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="2+2" className={`${control} w-28`} style={{ borderColor: 'var(--border)' }} />
        </label>
        <SubmitButton size="sm" disabled={!preview.ok}>
          Appliquer
        </SubmitButton>
      </div>
      <p
        className="mt-2.5 inline-block rounded-full px-3 py-1 text-xs font-bold"
        style={
          preview.neutral
            ? { background: 'var(--muted)', color: 'var(--muted-foreground)' }
            : preview.ok
              ? { background: 'color-mix(in srgb, var(--color-success) 14%, transparent)', color: 'var(--color-success)' }
              : { background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)' }
        }
      >
        {preview.ok ? '✓ ' : ''}
        {preview.text}
      </p>
      {state.error ? <p className="mt-1 text-xs font-semibold text-[color:var(--color-danger)]">{state.error}</p> : null}
    </form>
  );
}
