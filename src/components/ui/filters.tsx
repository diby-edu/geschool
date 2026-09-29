import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compteurs et filtres cliquables des pages de liste : une tuile (grand chiffre)
 * ou une pastille, qui sont des liens (le filtre vit dans l'URL). `active`
 * surligne le filtre en cours.
 *
 * Habit du tableau de bord : la tuile active est pleine, au dégradé du module de
 * la page ; les autres sont teintées de sa couleur (variables --mod-*, posées
 * par ModuleScope ; classes .mod-tile / .mod-pill de globals.css).
 */

export function FilterTile({
  href,
  label,
  value,
  active = false,
}: {
  href?: string;
  label: string;
  value: number;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span>{label}</span>
        {href ? <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-[2.1rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value.toLocaleString('fr-FR')}
      </p>
    </>
  );
  const className = cn(
    'mod-tile block rounded-[1.25rem] border px-4 py-3.5 transition-transform',
    href && 'hover:-translate-y-0.5 motion-reduce:hover:transform-none',
    active && 'mod-tile-active',
  );
  return href ? (
    <Link href={href} scroll={false} aria-current={active ? 'true' : undefined} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function FilterPill({
  href,
  label,
  value,
  active = false,
}: {
  href: string;
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn('mod-pill inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold', active && 'mod-pill-active')}
    >
      {label}
      <span className="mod-pill-count rounded-full px-1.5 text-xs tabular-nums">{value.toLocaleString('fr-FR')}</span>
    </Link>
  );
}
