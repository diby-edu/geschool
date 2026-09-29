'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULE_STYLE } from '@/lib/modules';
import { MODULE_ICON, type NavItem } from './nav-modules';

/**
 * Menu de l'espace : pastille colorée par module, entrée courante mise en
 * évidence (aria-current). Les entrées arrivent déjà filtrées par permission.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  const isActive = (href: string, i: number) => {
    // Le tableau de bord ne doit pas rester « actif » sur ses sous-pages.
    if (i === 0) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav aria-label="Menu principal" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
      {items.map((item, i) => {
        const active = isActive(item.href, i);
        const style = item.icon ? MODULE_STYLE[item.icon] : null;
        const Icon = item.icon ? MODULE_ICON[item.icon] : null;
        return (
          <div key={item.href} className="contents">
            {item.section && item.section !== items[i - 1]?.section ? (
              <p className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)] md:block">
                {item.section}
              </p>
            ) : null}
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[color:var(--color-brand-muted)] ${
                active ? 'bg-[color:var(--color-brand-muted)] font-semibold' : ''
              }`}
            >
              {style && Icon ? (
                <span
                  className="nav-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                  style={
                    {
                      '--chip-bg': style.tint,
                      '--chip-fg': style.ink,
                      '--chip-bg-dark': style.dtint,
                      '--chip-fg-dark': style.dink,
                    } as React.CSSProperties
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              ) : null}
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
