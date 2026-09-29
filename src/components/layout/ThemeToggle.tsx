'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_COOKIE, parseTheme, type Theme } from '@/lib/theme';

const QUERY = '(prefers-color-scheme: dark)';

/** Le thème vient de la page (attribut data-theme, posé par le serveur depuis le cookie) ou, à défaut, du système. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

function currentTheme(): Theme {
  return parseTheme(document.documentElement.getAttribute('data-theme')) ?? (window.matchMedia(QUERY).matches ? 'dark' : 'light');
}

/** Applique le thème tout de suite et le mémorise un an (cookie relu par le serveur : pas d'éclair au chargement). */
function applyTheme(next: Theme): void {
  document.documentElement.setAttribute('data-theme', next);
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

/** Bouton clair / sombre de l'en-tête. */
export function ThemeToggle() {
  // null côté serveur : le réglage du système n'y est pas connu.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);

  const seg = (value: Theme, label: string, Icon: typeof Sun) => {
    const active = theme === value;
    return (
      <button
        type="button"
        onClick={() => applyTheme(value)}
        aria-pressed={active}
        title={`Mode ${label.toLowerCase()}`}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          active
            ? 'bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm'
            : 'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]'
        }`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      className="flex items-center rounded-full p-0.5"
      style={{ backgroundColor: 'var(--color-brand-muted)' }}
    >
      {seg('light', 'Clair', Sun)}
      {seg('dark', 'Sombre', Moon)}
    </div>
  );
}
