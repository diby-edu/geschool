/**
 * Theme de l'interface (clair / sombre). Le choix de la personne est memorise
 * dans un cookie lisible cote serveur : la page arrive deja dans le bon theme,
 * sans eclair. Sans choix, l'interface suit le reglage du systeme
 * (prefers-color-scheme, voir globals.css).
 */
export const THEME_COOKIE = 'gs-theme';

export type Theme = 'light' | 'dark';

export function parseTheme(value: string | undefined | null): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}
