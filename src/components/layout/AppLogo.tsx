import { publicEnv } from '@/lib/env';

/**
 * Logo de l'application, en haut à gauche. Dessin simple (toit d'école + livre),
 * en dégradé de la marque : il tient en une icône sur mobile. À remplacer par le
 * logo définitif quand il existera — un seul endroit à changer.
 */
export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
        style={{ background: 'linear-gradient(135deg, #3730a3 0%, #6d28d9 60%, #c026d3 100%)' }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
          <path d="M7 10.5v4.2c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6v-4.2" />
          <path d="M21 7.5v5" />
        </svg>
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight">{publicEnv.NEXT_PUBLIC_PLATFORM_NAME}</span>
          <span className="block truncate text-[11px] text-[color:var(--muted-foreground)]">Gestion d’établissement</span>
        </span>
      )}
    </span>
  );
}
