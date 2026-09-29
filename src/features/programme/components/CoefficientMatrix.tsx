'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import type { CoefficientMatrix as Matrix } from '../board';

/**
 * Tableau croisé des coefficients : matières en lignes, niveaux en colonnes.
 *
 * On saisit directement dans la case. Vider une case retire la matière du
 * programme de ce niveau ; la remplir l'y ajoute. C'est la vue qui permet de
 * comparer — « Maths vaut 3 en 6ème et 5 en 1ère C » se lit sur une ligne.
 *
 * Le même tableau sert aux SÉANCES hebdomadaires (`mode="SEANCES"`) : c'est là
 * qu'on corrige le volume de plusieurs matières sur plusieurs niveaux d'un
 * coup, sans ouvrir chaque niveau l'un après l'autre.
 *
 * Affichage : le tableau ne se COMPRIME pas pour tenir dans la page — il prend
 * la largeur de ses colonnes et défile horizontalement. Sans cela, « 2NDE-A »
 * se coupait en deux lignes sur le trait d'union. La colonne des matières reste
 * visible pendant le défilement.
 */

/** La colonne figée prend la couleur de sa ligne (en-tête teinté, survol). */
const STICKY = { backgroundColor: 'inherit', boxShadow: 'inset -1px 0 0 var(--border)' } as const;

export function CoefficientMatrix({
  matrix,
  action,
  canEdit,
  mode = 'COEF',
}: {
  matrix: Matrix;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  canEdit: boolean;
  /** `COEF` : le poids dans la moyenne. `SEANCES` : les cours par semaine. */
  mode?: 'COEF' | 'SEANCES';
}) {
  const seances = mode === 'SEANCES';
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  // Les colonnes arrivent déjà groupées par ordre : on calcule les bandeaux et
  // les traits de séparation à partir de cette suite, sans la retrier.
  const groups: { track: string; count: number }[] = [];
  const boundary = new Set<number>();
  matrix.levels.forEach((l, i) => {
    const last = groups[groups.length - 1];
    if (last && last.track === l.track) last.count += 1;
    else {
      groups.push({ track: l.track, count: 1 });
      if (i > 0) boundary.add(i);
    }
  });

  if (matrix.levels.length === 0 || matrix.subjects.length === 0) {
    return (
      <Alert tone="info">
        {matrix.levels.length === 0
          ? 'Aucun niveau pour cet ordre d’enseignement : créez-les dans Structure pédagogique.'
          : 'Aucune matière pour cet ordre d’enseignement : créez-les dans l’onglet Matières.'}
      </Alert>
    );
  }

  return (
    /*
     * `key` sur le formulaire : les deux onglets (coefficients et séances) sont
     * LE MÊME composant. Sans cette clé, passer de l'un à l'autre fait réutiliser
     * à React les champs déjà affichés — ils gardent la valeur de l'onglet
     * précédent, seul leur `name` change, et l'enregistrement écrit des séances
     * dans les coefficients. La clé force un champ neuf à chaque changement.
     */
    <form key={mode} action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="overflow-x-auto rounded-3xl border" style={{ backgroundColor: 'var(--surface)' }}>
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            {/* Un bandeau par ordre d'enseignement : les colonnes ne se mélangent jamais. */}
            {groups.length > 1 ? (
              <tr className="bg-[color:var(--surface)] text-[color:var(--muted-foreground)]">
                <th className="sticky left-0 z-20 px-4 py-2" style={STICKY} />
                {groups.map((g) => (
                  <th
                    key={g.track}
                    colSpan={g.count}
                    className="whitespace-nowrap border-l px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide"
                  >
                    {TRACK_LABELS[g.track as EducationTrack] ?? g.track}
                  </th>
                ))}
              </tr>
            ) : null}
            <tr className="border-b bg-[color:var(--surface)] text-[color:var(--muted-foreground)]">
              <th
                className="sticky left-0 z-20 whitespace-nowrap px-4 py-2 text-left font-medium"
                style={STICKY}
              >
                Matière
              </th>
              {matrix.levels.map((l, i) => (
                <th
                  key={l.id}
                  className={`w-16 min-w-16 whitespace-nowrap px-2 py-2 text-center font-medium${
                    boundary.has(i) ? ' border-l' : ''
                  }`}
                  title={`${l.name}${l.classes > 0 ? ` · ${l.classes} classe(s)` : ' · aucune classe'}`}
                >
                  <span className="block text-xs font-bold">{l.code}</span>
                  {l.classes === 0 ? (
                    <span className="block text-[10px] font-normal normal-case tracking-normal" style={{ color: 'var(--color-warning)' }}>
                      0 classe
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.subjects.map((s) => (
              <tr key={s.id} className="border-b bg-[color:var(--surface)] last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap px-4 py-2 text-left font-normal"
                  style={STICKY}
                  title={s.name}
                >
                  {/* Un nom à rallonge ne doit pas manger la largeur : on coupe. */}
                  <span className="block max-w-64 truncate">
                    <span className="font-mono text-[11px] text-[color:var(--muted-foreground)]">{s.code}</span>{' '}
                    <span className="font-medium">{s.name}</span>
                  </span>
                </th>
                {matrix.levels.map((l, i) => {
                  const key = `${l.id}:${s.id}`;
                  // En séances, une case n'existe que si la matière est au
                  // programme : on ne l'y ajoute pas par un volume horaire.
                  const atProgramme = matrix.cells[key] !== undefined;
                  const value = seances
                    ? atProgramme
                      ? (matrix.sessions[key] ?? 0)
                      : undefined
                    : matrix.cells[key];
                  return (
                    <td key={l.id} className={`px-1 py-1.5 text-center${boundary.has(i) ? ' border-l' : ''}`}>
                      <input
                        name={seances ? `sess:${l.id}:${s.id}` : `coef:${l.id}:${s.id}`}
                        defaultValue={value === undefined ? '' : String(value)}
                        inputMode={seances ? 'numeric' : 'decimal'}
                        disabled={!canEdit || (seances && !atProgramme)}
                        title={seances ? `Une séance dure ${l.sessionMinutes} min` : undefined}
                        aria-label={
                          seances
                            ? `Séances de ${s.name} en ${l.name}`
                            : `Coefficient de ${s.name} en ${l.name}`
                        }
                        className="h-8 w-12 rounded-lg border text-center text-sm tabular-nums"
                        style={{
                          backgroundColor: value === undefined ? 'transparent' : 'var(--surface)',
                          color: value === undefined ? 'var(--muted-foreground)' : 'inherit',
                        }}
                        placeholder="·"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        {matrix.subjects.length} matière{matrix.subjects.length > 1 ? 's' : ''} × {matrix.levels.length} niveau
        {matrix.levels.length > 1 ? 'x' : ''} ·{' '}
        {seances
          ? 'une case grisée veut dire que la matière n’est pas au programme de ce niveau.'
          : 'toute matière créée dans l’onglet « Liste des matières » apparaît ici automatiquement.'}
      </p>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>{seances ? 'Enregistrer les séances' : 'Enregistrer les coefficients'}</SubmitButton>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            {seances
              ? 'Une case vidée met la matière à zéro séance, sans la retirer du programme.'
              : 'Une case vidée retire la matière du programme de ce niveau.'}
          </span>
        </div>
      ) : null}
    </form>
  );
}
