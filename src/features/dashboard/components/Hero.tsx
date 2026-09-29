import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { fr } from './ui';

export type HeroAction = { label: string; href: string; Icon: LucideIcon; group: 'create' | 'module' };

/**
 * Bandeau d'accueil de la direction : identité, effectifs en un coup d'œil, code école,
 * puis les actions de direction (créer) et les accès rapides (modules). Une action
 * n'apparaît que si la personne a le droit de l'utiliser.
 */
export function Hero({
  name,
  roleText,
  schoolName,
  dateText,
  periodText,
  schoolCode,
  chips,
  actions,
}: {
  name: string;
  roleText: string;
  schoolName: string;
  dateText: string;
  periodText: string;
  schoolCode?: string | undefined;
  chips: { label: string; value: number }[];
  actions: HeroAction[];
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  const create = actions.filter((a) => a.group === 'create');
  const modules = actions.filter((a) => a.group === 'module');
  const btn = (a: HeroAction) => (
    <Link
      key={a.label}
      href={a.href}
      className="flex items-center gap-2 whitespace-nowrap rounded-2xl border border-white/40 bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <a.Icon className="h-4 w-4" aria-hidden />
      {a.label}
    </Link>
  );

  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] p-6 text-white shadow-sm sm:p-7"
      style={{ background: 'linear-gradient(115deg, #3730a3 0%, #6d28d9 52%, #c026d3 100%)' }}
      aria-label="Bienvenue"
    >
      <div aria-hidden className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-56 h-60 w-60 rounded-full bg-white/[0.07]" />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-[4.25rem] w-[4.25rem] shrink-0 place-items-center rounded-[1.4rem] bg-white/20 text-2xl font-extrabold">{initials}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
              <span className="text-sm opacity-90">Bonjour,</span>
              {chips.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <li key={c.label} className="flex items-baseline gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3.5 py-1">
                      <span className="text-base font-bold tabular-nums">{fr(c.value)}</span>
                      <span className="text-xs">{c.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <h1 className="mt-1 truncate text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{name}</h1>
            <p className="mt-1 text-[13px] opacity-90">
              <span className="font-semibold uppercase tracking-wide">{roleText}</span> · {schoolName} · {dateText}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="whitespace-nowrap rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-medium">{periodText}</span>
          {schoolCode ? (
            <span className="whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs text-[#3730a3]">
              Code école <b className="ml-1.5 font-mono text-[15px] tracking-[0.18em]">{schoolCode}</b>
            </span>
          ) : null}
        </div>
      </div>

      {actions.length > 0 ? (
        <div className="relative mt-6 flex flex-wrap items-center gap-2.5">
          {create.map(btn)}
          {create.length > 0 && modules.length > 0 ? <span aria-hidden className="mx-1.5 hidden h-7 w-px bg-white/35 sm:block" /> : null}
          {modules.map(btn)}
        </div>
      ) : null}
    </section>
  );
}
