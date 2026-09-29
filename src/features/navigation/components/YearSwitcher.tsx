'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState } from 'react';
import { CalendarDays, Check, ChevronDown, Settings2 } from 'lucide-react';
import { switchYearAction } from '../actions';
import type { FormState } from '@/lib/forms';

/**
 * Année scolaire affichée, dans la barre du haut. Toujours cliquable : le menu
 * montre toutes les années configurées, celle en cours, et mène à leur gestion.
 * Changer d'année change ce que tout l'espace affiche (classes, notes, emploi du
 * temps, bulletins) ; une année clôturée se consulte mais ne se modifie plus.
 */
export function YearSwitcher({
  slug,
  years,
  currentId,
  isCurrent,
  manageHref,
}: {
  slug: string;
  years: { id: string; name: string; isCurrent: boolean }[];
  currentId: string | null;
  isCurrent: boolean;
  /** Page de gestion des années, si la personne y a accès. */
  manageHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [, formAction] = useActionState<FormState, FormData>(switchYearAction.bind(null, slug), {});
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const shown = years.find((y) => y.id === currentId)?.name ?? 'Aucune année';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[color:var(--color-brand-muted)]"
        style={{ backgroundColor: isCurrent ? 'var(--surface)' : 'color-mix(in oklch, var(--color-warning) 22%, var(--surface))' }}
        title={isCurrent ? 'Année scolaire en cours' : 'Vous consultez une autre année que l’année en cours'}
      >
        <CalendarDays className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" aria-hidden />
        {shown}
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="absolute left-0 z-50 mt-2 w-64 rounded-2xl border p-2 shadow-lg" style={{ backgroundColor: 'var(--surface)' }}>
          <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Année scolaire</p>

          {years.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[color:var(--muted-foreground)]">Aucune année configurée.</p>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="back" value={pathname} />
              {years.map((y) => (
                <button
                  key={y.id}
                  type="submit"
                  name="yearId"
                  value={y.id}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[color:var(--color-brand-muted)]"
                >
                  <Check className={`h-4 w-4 ${y.id === currentId ? '' : 'opacity-0'}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{y.name}</span>
                  {y.isCurrent ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'color-mix(in oklch, var(--color-success) 16%, var(--surface))', color: 'var(--color-success)' }}>
                      en cours
                    </span>
                  ) : null}
                </button>
              ))}
            </form>
          )}

          {manageHref ? (
            <Link
              href={manageHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 border-t px-3 py-2 text-sm text-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-muted)]"
            >
              <Settings2 className="h-4 w-4" aria-hidden /> Gérer les années scolaires
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
