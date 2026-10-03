import type { ReactNode } from 'react';
import type { BulletinDetail, BulletinItem } from '@/features/bulletins/types';
import {
  COLUMN_LABELS,
  MAX_SUBJECTS_ONE_PAGE,
  fillTokens,
  rowHeight,
  type BulletinTemplate,
  type ColumnId,
} from '@/features/reporting/template';
import { sortTiers, type Tier } from '@/features/reporting/config';

const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2).replace('.', ','));

export type BulletinSchool = {
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  registrationNumber: string | null;
  logoUrl: string | null;
  accent: string;
};

/**
 * Le bulletin tel qu'il est remis à la famille.
 *
 * Rien n'est décidé ici : les blocs, leur ordre, les colonnes et les textes
 * viennent du MODÈLE de l'établissement. Ce composant se contente de poser sur
 * la page ce que le modèle demande, et de garantir que ça tient sur une A4.
 */
export function BulletinView({
  b,
  t,
  school,
  tiers,
  editedOn,
  schoolYear,
}: {
  b: BulletinDetail;
  t: BulletinTemplate;
  school: BulletinSchool;
  tiers: Tier[];
  editedOn: string;
  schoolYear: string;
}) {
  const accent = t.accent ?? school.accent;
  const finAnnee = b.annual_average !== null;
  const has = (id: string) => t.blocks.includes(id as never);
  const cols = t.columns;
  const h = rowHeight(b.items.length, t.density);
  const jetons = {
    '{ville}': school.city ?? '',
    '{date}': editedOn,
    '{etablissement}': school.name,
    '{annee}': schoolYear,
  };

  const totalCoef = b.items.reduce((s, i) => s + i.coefficient, 0);
  const totalWeighted = b.items.reduce((s, i) => s + (i.weighted ?? 0), 0);

  return (
    <article className="bulletin mx-auto max-w-3xl rounded-[--radius-card] border bg-white p-6 text-black">
      {b.items.length > MAX_SUBJECTS_ONE_PAGE ? (
        <p className="no-print mb-3 rounded border border-amber-400 bg-amber-50 p-2 text-xs">
          {b.items.length} matières : au-delà de {MAX_SUBJECTS_ONE_PAGE}, aucune mise en page ne tient sur une seule
          feuille A4. Le bulletin s’imprimera sur deux pages.
        </p>
      ) : null}

      {has('header') ? (
        <header className="mb-3 flex items-center gap-3 border-b-2 pb-2" style={{ borderColor: accent }}>
          <div className="flex-1 text-[11px] leading-tight">
            {t.headerLines.map((l, i) => (
              <div key={i} className={i === 0 ? 'font-bold tracking-wide' : 'text-gray-600'}>
                {l}
              </div>
            ))}
          </div>
          {t.showLogo && school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
          ) : null}
          <div className="flex-1 text-right">
            <div className="text-base font-bold uppercase leading-tight">{school.name}</div>
            {school.address || school.city ? (
              <div className="text-[11px] text-gray-600">{[school.address, school.city].filter(Boolean).join(', ')}</div>
            ) : null}
            {school.phone ? <div className="text-[11px] text-gray-600">Tél. {school.phone}</div> : null}
            {school.registrationNumber ? (
              <div className="text-[11px] text-gray-600">Code établissement {school.registrationNumber}</div>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className="mb-3 border-b py-1 text-center" style={{ borderTopColor: accent }}>
        <span className="text-lg font-bold tracking-widest">{t.title}</span>
        <span className="text-sm text-gray-700">
          {' '}
          — {b.period} · année scolaire {schoolYear}
        </span>
      </div>

      {has('identity') || has('average') ? (
        <div className="mb-3 flex items-stretch gap-3">
          {has('identity') ? (
            <div className="grid flex-1 grid-cols-2 content-center gap-x-4 gap-y-0.5 text-sm">
              <div className="col-span-2">
                <span className="text-gray-500">Élève :</span> <strong>{b.student}</strong>
              </div>
              <div>
                <span className="text-gray-500">Matricule :</span> {b.matricule}
              </div>
              <div>
                <span className="text-gray-500">Classe :</span> <strong>{b.klass}</strong>
                {b.class_size ? ` · ${b.class_size} élèves` : ''}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {has('average') ? (
            <>
              {finAnnee ? (
                <div className="w-28 border-2 p-1.5 text-center" style={{ borderColor: accent, color: accent }}>
                  <div className="text-[10px] uppercase tracking-wide">{b.period}</div>
                  <div className="text-2xl font-bold leading-tight">{fmt(b.general_average)}</div>
                  <div className="text-xs">
                    {b.rank ?? '—'}
                    {b.class_size ? ` / ${b.class_size}` : ''}
                  </div>
                </div>
              ) : null}
              <div className="w-36 p-2 text-center text-white" style={{ backgroundColor: accent }}>
                <div className="text-[10px] uppercase tracking-wide opacity-90">
                  {finAnnee ? 'Moyenne annuelle' : 'Moyenne générale'}
                </div>
                <div className="text-3xl font-bold leading-tight">
                  {fmt(finAnnee ? b.annual_average : b.general_average)}
                </div>
                <div className="text-xs opacity-90">
                  {(finAnnee ? b.annual_rank : b.rank) ?? '—'}
                  {b.class_size ? ` / ${b.class_size}` : ''}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <table
        className="w-full border-collapse"
        style={{ fontSize: h <= 26 ? 11 : h <= 29 ? 12 : 13, lineHeight: 1.1 }}
      >
        <thead>
          <tr className="border-y text-white" style={{ backgroundColor: accent }}>
            {cols.map((c) => (
              <th key={c} className={headClass(c)}>
                {COLUMN_LABELS[c].title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.items.map((it, i) => (
            <tr
              key={i}
              className="border-b"
              style={{ height: h, backgroundColor: i % 2 ? '#fbfbf9' : undefined }}
            >
              {cols.map((c) => (
                <td key={c} className={cellClass(c)}>
                  {cell(c, it)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {has('totals') ? (
          <tfoot>
            <tr className="border-y-2 bg-gray-50 font-bold" style={{ borderColor: accent }}>
              {cols.map((c) => (
                <td key={c} className={cellClass(c)}>
                  {c === 'subject' ? 'Totaux' : null}
                  {c === 'coefficient' ? totalCoef : null}
                  {c === 'points' ? totalWeighted.toFixed(2).replace('.', ',') : null}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>

      {has('scale') ? (
        <p className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-gray-600">
          <span className="font-semibold text-gray-800">Échelle des appréciations :</span>
          {sortTiers(tiers).map((t2) => (
            <span key={t2.min}>
              {t2.label} {t2.min > 0 ? t2.min : '< ' + (sortTiers(tiers).at(-2)?.min ?? 0)}
            </span>
          ))}
        </p>
      ) : null}

      {has('stats') ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Case label="Moyenne de la classe" value={fmt(b.class_average)} />
          <Case label="Absences" value={String(b.absences)} />
          <Case label="Retards" value={String(b.lateness)} />
        </div>
      ) : null}

      {has('previous') && b.previous.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border border-dashed p-2 text-sm">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            {finAnnee ? 'Bilan de l’année' : 'Moyennes de l’année'}
          </span>
          {b.previous.map((p) => (
            <span key={p.name}>
              {p.name} <strong>{fmt(p.average)}</strong>
              {p.rank ? <span className="text-gray-500"> ({p.rank}ᵉ)</span> : null}
            </span>
          ))}
          <span className="font-bold">
            {b.period} {fmt(b.general_average)}
            {b.rank ? <span className="font-normal text-gray-500"> ({b.rank}ᵉ)</span> : null}
          </span>
        </div>
      ) : null}

      {finAnnee && (has('mention') || has('decision')) ? (
        <div className="mt-2 grid gap-2 text-sm" style={{ gridTemplateColumns: has('decision') && has('mention') ? '1fr 1fr' : '1fr' }}>
          {has('mention') ? (
            <div className="border p-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Mention de l’année</div>
              <div className="font-bold" style={{ color: accent }}>
                {b.distinction_label ?? '—'}
              </div>
              {b.distinction_note ? <div className="text-xs text-gray-600">{b.distinction_note}</div> : null}
            </div>
          ) : null}
          {has('decision') ? (
            <div className="border p-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Décision du conseil de classe</div>
              <div className="font-bold">{b.decision_label ?? '—'}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {has('council') && (b.council_comment || b.head_teacher_comment || (!finAnnee && b.distinction_label)) ? (
        <div className="mt-2 border p-2 text-sm">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Appréciation générale du conseil de classe
          </div>
          <div>
            {/* La mention calculée ouvre la phrase ; le conseil la complète. */}
            {!finAnnee && b.distinction_label ? <strong>{b.distinction_label}. </strong> : null}
            {b.council_comment ?? b.head_teacher_comment}
            {b.distinction_note && !finAnnee ? <span className="text-gray-600"> {b.distinction_note}</span> : null}
          </div>
        </div>
      ) : null}

      {has('signatures') ? (
        <div
          className="mt-4 grid gap-2 text-sm"
          style={{ gridTemplateColumns: `repeat(${t.signatures.length}, minmax(0, 1fr))` }}
        >
          {t.signatures.map((r) => (
            <div key={r} className="flex h-20 flex-col border p-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">{r}</div>
            </div>
          ))}
        </div>
      ) : null}

      {b.revision > 0 ? (
        <p className="mt-2 border-t pt-1 text-[10px] font-semibold">
          Bulletin rectifié{b.revision > 1 ? ` (${b.revision}ᵉ rectification)` : ''} — il remplace celui qui vous a été
          remis.
        </p>
      ) : null}

      {has('footer') ? (
        <div className="mt-2 flex items-baseline text-[10px] text-gray-600">
          <span className="flex-1">{fillTokens(t.footerLeft, jetons)}</span>
          <span>{fillTokens(t.footerRight, jetons)}</span>
        </div>
      ) : null}

      <style>{`
        @media print {
          body { background: #fff; }
          .app-nav, .app-shell-nav, nav, header.app-header { display: none !important; }
          .no-print { display: none !important; }
          .bulletin { border: none !important; box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </article>
  );
}

function Case({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

const LEFT: ColumnId[] = ['subject', 'teacher'];

function headClass(c: ColumnId): string {
  return `px-2 py-1 font-semibold ${LEFT.includes(c) ? 'text-left' : 'text-center'}`;
}

function cellClass(c: ColumnId): string {
  if (c === 'subject') return 'px-2 py-0 font-medium';
  if (c === 'teacher') return 'px-2 py-0 text-[0.85em]';
  return 'px-1 py-0 text-center';
}

function cell(c: ColumnId, it: BulletinItem): ReactNode {
  switch (c) {
    case 'subject':
      return it.subject;
    case 'coefficient':
      return it.coefficient;
    case 'average':
      return <span className="font-bold">{fmt(it.average)}</span>;
    case 'points':
      return fmt(it.weighted);
    case 'rank':
      return it.rank ?? '—';
    case 'appreciation':
      return it.appreciation ?? '—';
    case 'teacher':
      return it.teacher ?? '';
    case 'signature':
      return null;
    case 'classAverage':
      return fmt(it.class_average);
    case 'min':
      return fmt(it.class_min);
    case 'max':
      return fmt(it.class_max);
  }
}
