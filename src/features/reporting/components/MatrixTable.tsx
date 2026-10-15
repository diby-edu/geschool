'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { fmt, ordinal, statsOf, type Matrix } from '@/features/reporting/matrix-core';

type FlagState = 'OPEN' | 'CORRECTED' | 'MAINTAINED';

const FLAG_COLOR: Record<FlagState, string> = {
  OPEN: '#f6c453',
  CORRECTED: '#9fd9b3',
  MAINTAINED: '#b9cdf3',
};

/**
 * La matrice à l'écran et à l'impression (A4 paysage, recto-verso).
 *
 * Pour le professeur principal, chaque case élève × matière est un bouton :
 * un clic la SIGNALE au professeur de la matière (rien à écrire). La case
 * prend la couleur de son état : en attente, corrigé, maintenu.
 */
export function MatrixTable({
  matrix,
  flags,
  flagAction,
}: {
  matrix: Matrix;
  /** `${studentId}:${subjectId}` -> état du signalement. */
  flags?: Record<string, FlagState>;
  flagAction?: (studentId: string, subjectId: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const m = matrix;

  function flag(studentId: string, subjectId: string) {
    if (!flagAction || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await flagAction(studentId, subjectId);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  const genCols = [
    ...m.recallLabels.map((label, k) => ({ label, pick: (r: Matrix['rows'][number]) => r.recalls[k]!, cls: 'gen' })),
    { label: m.recallLabels.length > 0 ? m.periodName : 'Moyenne générale', pick: (r: Matrix['rows'][number]) => r.general, cls: 'gen' },
    ...(m.hasAnnual ? [{ label: 'Annuelle', pick: (r: Matrix['rows'][number]) => r.annual!, cls: 'ann' }] : []),
  ];

  const subjectStats = m.subjects.map((s) => statsOf(m.rows.map((r) => (r.cells[s.id]?.exempt ? null : (r.cells[s.id]?.average ?? null)))));
  const genStats = genCols.map((c) => statsOf(m.rows.map((r) => c.pick(r)?.average ?? null)));

  return (
    <div className="matrix-wrap">
      {error ? <p className="no-print mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="matrix">
          <thead>
            <tr>
              <th rowSpan={2}>N°</th>
              <th rowSpan={2} className="nom">Nom et prénoms</th>
              {m.subjects.map((s) => (
                <th key={s.id} colSpan={2}>
                  {s.name}
                  <br />
                  <span className="sub">coef {s.coefficient}</span>
                  <br />
                  <span className="sub">moy. classe {fmt(s.classAverage)}</span>
                </th>
              ))}
              {genCols.map((c) => (
                <th key={c.label} colSpan={2} className={c.cls}>
                  {c.label}
                </th>
              ))}
            </tr>
            <tr>
              {m.subjects.map((s) => (
                <SubHead key={s.id} />
              ))}
              {genCols.map((c) => (
                <SubHead key={c.label} cls={c.cls} />
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={r.studentId}>
                <td className="num">{i + 1}</td>
                <td className="nom">{r.name}</td>
                {m.subjects.map((s) => {
                  const c = r.cells[s.id]!;
                  if (c.exempt) {
                    return (
                      <td key={s.id} colSpan={2} className="disp">
                        Dispensé{r.female ? 'e' : ''}
                      </td>
                    );
                  }
                  const state = flags?.[`${r.studentId}:${s.id}`];
                  const style = state ? { backgroundColor: FLAG_COLOR[state] } : undefined;
                  return flagAction && !state ? (
                    <td key={s.id} colSpan={2} className="flaggable" style={style}>
                      <button
                        type="button"
                        title={`Signaler la moyenne de ${s.name} de ${r.name}`}
                        onClick={() => flag(r.studentId, s.id)}
                        disabled={pending}
                      >
                        <span>{fmt(c.average)}</span>
                        <span>{ordinal(c, r.female)}</span>
                      </button>
                    </td>
                  ) : (
                    <FragmentCells key={s.id} a={fmt(c.average)} b={ordinal(c, r.female)} style={style} />
                  );
                })}
                {genCols.map((c) => {
                  const v = c.pick(r);
                  return <FragmentCells key={c.label} a={fmt(v?.average ?? null)} b={v ? ordinal(v, r.female) : ''} cls={c.cls} />;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(
              [
                ['Moyenne de la classe', 'average'],
                ['Moyenne la plus forte', 'max'],
                ['Moyenne la plus faible', 'min'],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td colSpan={2} className="nom">{label}</td>
                {subjectStats.map((st, k) => (
                  <td key={m.subjects[k]!.id} colSpan={2}>{fmt(st[key])}</td>
                ))}
                {genStats.map((st, k) => (
                  <td key={genCols[k]!.label} colSpan={2} className={genCols[k]!.cls}>{fmt(st[key])}</td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      <style>{`
        .matrix { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; color: #111; background: #fff; }
        .matrix th, .matrix td { border: 0.5px solid #8a8a8a; padding: 2px 3px; text-align: center; white-space: nowrap; overflow: hidden; }
        .matrix thead th { background: #e8f1ec; font-weight: 600; white-space: normal; line-height: 1.15; }
        .matrix .sub { font-weight: 400; color: #333; font-size: 0.9em; }
        .matrix td.nom, .matrix th.nom { text-align: left; width: 14rem; }
        .matrix th:first-child, .matrix td.num { width: 2.2rem; color: #555; }
        .matrix tbody tr:nth-child(even) td { background-color: #f7f7f7; }
        .matrix .gen { background: #fff4d6 !important; font-weight: 600; }
        .matrix thead th.gen { background: #f6dc93 !important; }
        .matrix .ann { background: #ffe1d6 !important; font-weight: 600; }
        .matrix thead th.ann { background: #f3b49c !important; }
        .matrix .disp { font-style: italic; color: #555; }
        .matrix tfoot td { background: #eef3f0; font-weight: 600; }
        .matrix .flaggable { padding: 0; }
        .matrix .flaggable button { display: flex; width: 100%; justify-content: space-around; gap: 4px; padding: 2px 3px; cursor: pointer; }
        .matrix .flaggable button:hover { background: #fde9b8; }
        @media print {
          body { background: #fff; }
          .app-nav, .app-shell-nav, nav, header.app-header { display: none !important; }
          .no-print { display: none !important; }
          .matrix { font-size: 6.6pt; }
          .matrix td.nom, .matrix th.nom { width: 13%; }
          .matrix th:first-child, .matrix td.num { width: 2.2%; }
          .matrix thead { display: table-header-group; }
          .matrix tr { page-break-inside: avoid; }
          .overflow-x-auto { overflow: visible !important; }
          @page { size: A4 landscape; margin: 8mm 7mm; }
        }
      `}</style>
    </div>
  );
}

function SubHead({ cls }: { cls?: string | undefined }) {
  return (
    <>
      <th className={cls}>Moy</th>
      <th className={cls}>Rg</th>
    </>
  );
}

function FragmentCells({ a, b, cls, style }: { a: string; b: string; cls?: string | undefined; style?: CSSProperties | undefined }) {
  return (
    <>
      <td className={cls} style={style}>{a}</td>
      <td className={cls} style={style}>{b}</td>
    </>
  );
}
