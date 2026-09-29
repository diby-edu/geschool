import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Tuile de module du tableau de bord : un anneau de progression et deux chiffres
 * clés sur un fond de couleur propre au module. Elle mène à la page du module.
 * Composant serveur : rien à hydrater pour un anneau SVG.
 */

export type Tone = 'green' | 'indigo' | 'violet' | 'amber';

/** Dégradés dont l'extrémité la plus claire garde un contraste ≥ 4,5:1 avec le texte blanc (calculé, pas estimé). */
const GRADIENT: Record<Tone, string> = {
  green: 'linear-gradient(135deg, #065f46 0%, #0a7d55 100%)',
  indigo: 'linear-gradient(135deg, #3730a3 0%, #5b50e6 100%)',
  violet: 'linear-gradient(135deg, #6d28d9 0%, #8347ea 100%)',
  amber: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
};

const R = 30;
const CIRCUMFERENCE = 2 * Math.PI * R;

function Ring({ percent, label, unit }: { percent: number | null; label: string; unit?: string | undefined }) {
  const pct = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="8" />
        {pct > 0 ? (
          <circle
            cx="42"
            cy="42"
            r={R}
            fill="none"
            stroke="#ffffff"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <span>
          <span className={`block font-bold tabular-nums ${label.length > 5 ? 'text-sm' : label.length === 5 ? 'text-base' : 'text-lg'}`}>{label}</span>
          {unit ? <span className="mt-0.5 block text-[10px] font-medium opacity-90">{unit}</span> : null}
        </span>
      </div>
    </div>
  );
}

export function ModuleTile({
  href,
  title,
  icon: Icon,
  tone,
  percent,
  ringLabel,
  ringUnit,
  headline,
  detail,
  footer,
}: {
  href: string;
  title: string;
  icon: LucideIcon;
  tone: Tone;
  /** 0–100 ; null = pas de mesure (anneau vide, jamais un faux 0 %). */
  percent: number | null;
  ringLabel: string;
  ringUnit?: string | undefined;
  headline: string;
  detail: string;
  footer: [string, string];
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
      style={{ background: GRADIENT[tone] }}
    >
      <div className="flex items-center gap-4 p-4">
        <Ring percent={percent} label={ringLabel} unit={ringUnit} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold tracking-tight">{title}</h3>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/20">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold leading-snug">{headline}</p>
          <p className="mt-0.5 text-xs leading-snug opacity-90">{detail}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 bg-black/15 px-4 py-2 text-xs font-medium">
        <span>{footer[0]}</span>
        <span>{footer[1]}</span>
      </div>
    </Link>
  );
}
