'use client';

import { usePathname } from 'next/navigation';
import { pageTheme } from './page-theme';

/**
 * Pose les couleurs du module de la page courante en variables CSS (--mod-*),
 * lues par l'en-tête de page, les tuiles, les tableaux et les états vides
 * (globals.css, « Habit des modules »). Une page n'a rien à déclarer : son
 * adresse suffit (page-theme.ts).
 */
export function ModuleScope({ children }: { children: React.ReactNode }) {
  const theme = pageTheme(usePathname());
  const s = theme.style;
  return (
    <div
      className={theme.brand ? 'mod-scope mod-brand' : 'mod-scope'}
      data-module={theme.key}
      style={
        {
          '--mod-c1': s.c1,
          '--mod-c2': s.c2,
          '--mod-on': s.onBlock,
          '--mod-tint': s.tint,
          '--mod-ink': s.ink,
          '--mod-dtint': s.dtint,
          '--mod-dink': s.dink,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** Pastille du module (icône) et sa ligne d'intitulé, pour l'en-tête de page. */
export function PageThemeBadge({ variant = 'hero' }: { variant?: 'hero' | 'soft' }) {
  const theme = pageTheme(usePathname());
  const Icon = theme.icon;
  if (variant === 'soft') {
    return (
      <span className="mod-soft-chip mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl" aria-hidden>
        <Icon className="h-6 w-6" />
      </span>
    );
  }
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/25" aria-hidden>
      <Icon className="h-6 w-6" />
    </span>
  );
}

export function PageThemeEyebrow() {
  const theme = pageTheme(usePathname());
  return <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{theme.eyebrow}</p>;
}
