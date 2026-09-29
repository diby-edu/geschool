import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MODULE_ICON } from '@/components/layout/nav-modules';
import { MODULE_STYLE, moduleGradient, type ModuleKey } from '@/lib/modules';
import { EscapeClose } from './EscapeClose';

/** Briques communes du tableau de bord de la direction. Les couleurs de surface viennent des jetons (clair / sombre). */

export const fr = (n: number): string => n.toLocaleString('fr-FR');
export const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one);
export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const pct1 = (n: number): string => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border p-5 ${className}`} style={{ backgroundColor: 'var(--surface)' }}>
      {children}
    </div>
  );
}

/** Colonne d'un bloc : légèrement teintée, pour séparer visuellement les sections. */
export function Sub({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-3 rounded-[1.4rem] border p-4 ${className}`}
      style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 3%, var(--surface))' }}
    >
      {children}
    </div>
  );
}

export function BlocHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {sub ? <p className="mt-0.5 text-sm text-[color:var(--muted-foreground)]">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Pastille de module : la même couleur que dans le menu. */
export function ModuleChip({ module, size = 24 }: { module: ModuleKey; size?: number }) {
  const s = MODULE_STYLE[module];
  const Icon = MODULE_ICON[module];
  return (
    <span
      className="nav-chip grid shrink-0 place-items-center rounded-lg"
      style={
        {
          width: size,
          height: size,
          '--chip-bg': s.tint,
          '--chip-fg': s.ink,
          '--chip-bg-dark': s.dtint,
          '--chip-fg-dark': s.dink,
        } as React.CSSProperties
      }
    >
      <Icon style={{ width: size * 0.58, height: size * 0.58 }} aria-hidden />
    </span>
  );
}

export function SecLabel({ n, module, children }: { n?: string | undefined; module: ModuleKey; children: React.ReactNode }) {
  const s = MODULE_STYLE[module];
  return (
    <div className="flex items-center gap-2">
      {n ? (
        <span
          className="nav-chip grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-extrabold"
          style={{ '--chip-bg': s.tint, '--chip-fg': s.ink, '--chip-bg-dark': s.dtint, '--chip-fg-dark': s.dink } as React.CSSProperties}
        >
          {n}
        </span>
      ) : (
        <ModuleChip module={module} />
      )}
      <h3 className="text-xs font-bold uppercase leading-snug tracking-wider">{children}</h3>
    </div>
  );
}

type Tone = 'green' | 'rose' | 'amber' | 'indigo' | 'violet';
const TONE: Record<Tone, ModuleKey> = { green: 'presences', rose: 'bulletins', amber: 'acces', indigo: 'notes', violet: 'eleves' };

/** Tuile colorée pleine (dégradé + texte contrasté), cliquable quand elle mène à un détail. */
export function Tile({
  tone,
  module,
  label,
  value,
  unit,
  sub,
  href,
  min = 0,
  size = 44,
  extra,
  className = '',
}: {
  tone?: Tone | undefined;
  module?: ModuleKey | undefined;
  label: React.ReactNode;
  value: string;
  unit?: string | undefined;
  sub?: React.ReactNode;
  href?: string | undefined;
  min?: number | undefined;
  size?: number | undefined;
  extra?: React.ReactNode;
  className?: string | undefined;
}) {
  const key: ModuleKey = module ?? TONE[tone ?? 'indigo'];
  const s = MODULE_STYLE[key];
  const body = (
    <div
      className={`flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-[1.25rem] p-4 ${className}`}
      style={{ background: moduleGradient(key), color: s.onBlock, minHeight: min }}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span>{label}</span>
        {href ? <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      </div>
      <div className="font-extrabold leading-none tracking-tight tabular-nums" style={{ fontSize: size }}>
        {value}
        {unit ? <span className="font-semibold opacity-85" style={{ fontSize: Math.round(size * 0.36) }}> {unit}</span> : null}
      </div>
      {sub ? <div className="text-xs font-medium leading-snug">{sub}</div> : null}
      {extra}
    </div>
  );
  return href ? (
    <Link href={href} scroll={false} className="flex min-w-0 rounded-[1.25rem] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Pill({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'bad' | 'warn' | 'info' | 'muted' }) {
  const bg = {
    plain: 'rgba(255,255,255,0.2)',
    good: 'color-mix(in oklch, var(--color-success) 18%, var(--surface))',
    bad: 'color-mix(in oklch, var(--color-danger) 16%, var(--surface))',
    warn: 'color-mix(in oklch, var(--color-warning) 22%, var(--surface))',
    info: 'var(--color-brand-muted)',
    muted: 'color-mix(in oklch, var(--foreground) 8%, var(--surface))',
  }[tone];
  const color = { plain: 'inherit', good: 'var(--color-success)', bad: 'var(--color-danger)', warn: 'color-mix(in oklch, var(--color-warning) 55%, var(--foreground))', info: 'var(--color-brand)', muted: 'var(--muted-foreground)' }[tone];
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: bg, color }}>
      {children}
    </span>
  );
}

/** Anneau de progression (SVG) : 0–100, ou null = pas de mesure (anneau vide, jamais un faux 0 %). */
export function Ring({ percent, label, sub, dark = false }: { percent: number | null; label: string; sub?: string | undefined; dark?: boolean | undefined }) {
  const R = 38;
  const C = 2 * Math.PI * R;
  const p = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const track = dark ? 'rgba(43,26,0,0.18)' : 'rgba(255,255,255,0.25)';
  const stroke = dark ? '#2b1a00' : '#ffffff';
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90" fill="none" strokeWidth="10" aria-hidden>
        <circle cx="48" cy="48" r={R} stroke={track} />
        {p > 0 ? <circle cx="48" cy="48" r={R} stroke={stroke} strokeLinecap="round" strokeDasharray={`${(p / 100) * C} ${C}`} /> : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <span>
          <span className={`block font-extrabold tabular-nums ${label.length > 5 ? 'text-sm' : 'text-lg'}`}>{label}</span>
          {sub ? <span className="mt-0.5 block text-[10px] font-semibold">{sub}</span> : null}
        </span>
      </div>
    </div>
  );
}

export function Meter({ percent, dark = false }: { percent: number; dark?: boolean }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: dark ? 'rgba(43,26,0,0.18)' : 'rgba(255,255,255,0.25)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: dark ? '#2b1a00' : '#ffffff' }} />
    </div>
  );
}

/** Sélecteur de période : des liens (l'URL porte le choix), une option peut être désactivée (période pas commencée). */
export function Seg({ items, label }: { items: { key: string; label: string; href: string; active: boolean; disabled?: boolean }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 self-start rounded-full p-1" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
      {items.map((i) =>
        i.disabled ? (
          <span key={i.key} className="cursor-not-allowed whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold opacity-45" title="Période pas encore commencée">
            {i.label}
          </span>
        ) : (
          <Link
            key={i.key}
            href={i.href}
            scroll={false}
            aria-current={i.active ? 'true' : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              i.active ? 'bg-[color:var(--color-brand)] text-[color:var(--color-brand-foreground)]' : 'text-[color:var(--foreground)] hover:bg-[color:var(--surface)]'
            }`}
          >
            {i.label}
          </Link>
        ),
      )}
    </div>
  );
}

/** Panneau latéral (détail d'un chiffre) : se ferme par un lien, la touche Échap ou un clic à côté. */
export function Drawer({ title, sub, closeHref, children }: { title: string; sub?: string; closeHref: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <EscapeClose href={closeHref} />
      <Link href={closeHref} scroll={false} className="flex-1" style={{ backgroundColor: 'rgba(8,10,28,0.5)' }} aria-label="Fermer le détail" />
      <aside className="h-full w-full max-w-[30rem] overflow-y-auto border-l p-5 shadow-2xl" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold leading-tight tracking-tight">{title}</h2>
            {sub ? <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">{sub}</p> : null}
          </div>
          <Link href={closeHref} scroll={false} className="rounded-xl border px-3 py-1.5 text-sm font-semibold hover:bg-[color:var(--color-brand-muted)]">
            Fermer
          </Link>
        </div>
        <div className="mt-4">{children}</div>
      </aside>
    </div>
  );
}
