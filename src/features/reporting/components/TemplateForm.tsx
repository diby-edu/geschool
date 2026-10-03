'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { BulletinView, type BulletinSchool } from '@/features/bulletins/components/BulletinView';
import type { Tier } from '@/features/reporting/config';
import {
  BLOCK_IDS,
  BLOCK_LABELS,
  COLUMN_IDS,
  COLUMN_LABELS,
  DENSITY_LABELS,
  FOOTER_TOKENS,
  type BulletinTemplate,
  type Density,
} from '@/features/reporting/template';
import { EXEMPLE_BULLETIN } from '@/features/reporting/sample';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * L'éditeur de modèle.
 *
 * À gauche les réglages, à droite un VRAI bulletin qui se redessine à chaque
 * clic — pas un schéma. C'est le même composant que celui qui imprime, nourri
 * d'un élève d'exemple : ce qu'on voit est ce qui sortira.
 */
export function TemplateForm({
  action,
  template,
  school,
  tiers,
  editedOn,
  schoolYear,
}: {
  action: Action;
  template: BulletinTemplate;
  school: BulletinSchool;
  tiers: Tier[];
  editedOn: string;
  schoolYear: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [t, setT] = useState<BulletinTemplate>(template);

  const maj = <K extends keyof BulletinTemplate>(k: K, v: BulletinTemplate[K]) => setT((p) => ({ ...p, [k]: v }));

  const basculer = <T extends string>(liste: T[], id: T, tous: readonly T[]): T[] =>
    liste.includes(id) ? liste.filter((x) => x !== id) : [...tous].filter((x) => liste.includes(x) || x === id);

  const deplacer = <T,>(liste: T[], i: number, sens: -1 | 1): T[] => {
    const j = i + sens;
    if (j < 0 || j >= liste.length) return liste;
    const copie = [...liste];
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
    return copie;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form action={formAction} className="space-y-5">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Bloc titre="En-tête">
          <Champ label="Titre du document">
            <input
              name="title"
              value={t.title}
              onChange={(e) => maj('title', e.target.value)}
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
            />
          </Champ>
          <Champ label="Lignes officielles" aide="Une par ligne. Réécrivez-les pour un autre pays ou un autre ministère.">
            <textarea
              name="headerLines"
              rows={3}
              value={t.headerLines.join('\n')}
              onChange={(e) => maj('headerLines', e.target.value.split('\n'))}
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
            />
          </Champ>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="showLogo"
              checked={t.showLogo}
              onChange={(e) => maj('showLogo', e.target.checked)}
              className="size-4"
            />
            Afficher le logo de l’établissement
          </label>
        </Bloc>

        <Bloc titre="Blocs de la page" aide="Décochez pour masquer, les flèches changent l’ordre.">
          <ul className="space-y-1">
            {t.blocks.map((id, i) => (
              <li key={id} className="flex items-start gap-2 rounded-xl border p-2" style={{ backgroundColor: 'var(--surface)' }}>
                <input
                  type="checkbox"
                  name={BLOCK_LABELS[id].locked ? undefined : 'blocks'}
                  value={id}
                  checked
                  disabled={BLOCK_LABELS[id].locked}
                  onChange={() => maj('blocks', t.blocks.filter((b) => b !== id))}
                  className="mt-0.5 size-4"
                />
                {BLOCK_LABELS[id].locked ? <input type="hidden" name="blocks" value={id} /> : null}
                <span className="flex-1 text-sm">
                  <span className="font-medium">{BLOCK_LABELS[id].title}</span>
                  <br />
                  <span className="text-xs text-[color:var(--muted-foreground)]">{BLOCK_LABELS[id].hint}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Fleche onClick={() => maj('blocks', deplacer(t.blocks, i, -1))} sens="↑" />
                  <Fleche onClick={() => maj('blocks', deplacer(t.blocks, i, 1))} sens="↓" />
                </span>
              </li>
            ))}
          </ul>
          {BLOCK_IDS.filter((b) => !t.blocks.includes(b)).length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {BLOCK_IDS.filter((b) => !t.blocks.includes(b)).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => maj('blocks', basculer(t.blocks, b, BLOCK_IDS))}
                  className="rounded-xl border px-2 py-1 text-xs"
                >
                  + {BLOCK_LABELS[b].title}
                </button>
              ))}
            </div>
          ) : null}
        </Bloc>

        <Bloc titre="Colonnes du tableau" aide="Neuf au maximum : au-delà, la page ne tient plus.">
          <ul className="space-y-1">
            {t.columns.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-xl border p-2" style={{ backgroundColor: 'var(--surface)' }}>
                <input
                  type="checkbox"
                  name={COLUMN_LABELS[id].locked ? undefined : 'columns'}
                  value={id}
                  checked
                  disabled={COLUMN_LABELS[id].locked}
                  onChange={() => maj('columns', t.columns.filter((c) => c !== id))}
                  className="size-4"
                />
                {COLUMN_LABELS[id].locked ? <input type="hidden" name="columns" value={id} /> : null}
                <span className="flex-1 text-sm font-medium">{COLUMN_LABELS[id].title}</span>
                <Fleche onClick={() => maj('columns', deplacer(t.columns, i, -1))} sens="↑" />
                <Fleche onClick={() => maj('columns', deplacer(t.columns, i, 1))} sens="↓" />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {COLUMN_IDS.filter((c) => !t.columns.includes(c)).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => maj('columns', basculer(t.columns, c, COLUMN_IDS))}
                className="rounded-xl border px-2 py-1 text-xs"
              >
                + {COLUMN_LABELS[c].title}
              </button>
            ))}
          </div>
        </Bloc>

        <Bloc titre="Signatures" aide="Une par ligne, quatre au maximum.">
          <textarea
            name="signatures"
            rows={3}
            value={t.signatures.join('\n')}
            onChange={(e) => maj('signatures', e.target.value.split('\n'))}
            className="w-full rounded-xl border px-2 py-1.5 text-sm"
          />
        </Bloc>

        <Bloc titre="Pied de page" aide={`Raccourcis : ${Object.keys(FOOTER_TOKENS).join(' ')}`}>
          <input
            name="footerLeft"
            value={t.footerLeft}
            onChange={(e) => maj('footerLeft', e.target.value)}
            className="w-full rounded-xl border px-2 py-1.5 text-sm"
          />
          <input
            name="footerRight"
            value={t.footerRight}
            onChange={(e) => maj('footerRight', e.target.value)}
            className="w-full rounded-xl border px-2 py-1.5 text-sm"
          />
        </Bloc>

        <Bloc titre="Apparence">
          <Champ label="Couleur" aide="Vide = la couleur de l’établissement.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={t.accent ?? school.accent}
                onChange={(e) => maj('accent', e.target.value)}
                className="h-9 w-14 rounded-lg border"
              />
              <input type="hidden" name="accent" value={t.accent ?? ''} />
              {t.accent ? (
                <button type="button" onClick={() => maj('accent', null)} className="rounded-xl border px-2 py-1 text-xs">
                  Revenir à celle de l’établissement
                </button>
              ) : null}
            </div>
          </Champ>
          <div className="space-y-1">
            {(['NORMAL', 'COMPACT'] as Density[]).map((d) => (
              <label key={d} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="density"
                  value={d}
                  checked={t.density === d}
                  onChange={() => maj('density', d)}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">{DENSITY_LABELS[d].title}</span>
                  <br />
                  <span className="text-xs text-[color:var(--muted-foreground)]">{DENSITY_LABELS[d].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Bloc>

        <SubmitButton>Enregistrer le modèle</SubmitButton>
      </form>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">
          Aperçu réel, avec un élève d’exemple : c’est le composant qui imprime.
        </p>
        <div className="origin-top-left scale-[0.78] lg:scale-90">
          <BulletinView
            b={EXEMPLE_BULLETIN}
            t={t}
            school={school}
            tiers={tiers}
            editedOn={editedOn}
            schoolYear={schoolYear}
          />
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{titre}</p>
        {aide ? <p className="text-xs text-[color:var(--muted-foreground)]">{aide}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Champ({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      {children}
      {aide ? <p className="text-xs text-[color:var(--muted-foreground)]">{aide}</p> : null}
    </div>
  );
}

function Fleche({ onClick, sens }: { onClick: () => void; sens: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border px-2 py-0.5 text-xs" aria-label={`Déplacer ${sens}`}>
      {sens}
    </button>
  );
}
