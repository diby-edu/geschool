import { Bricolage_Grotesque, Sora } from 'next/font/google';

/**
 * Polices de la vitrine publique (landing + authentification) uniquement.
 *
 * L'application interne garde sa police sobre (--font-sans, globals.css) :
 * huit heures par jour d'usage ne se pretent pas a une identite marketing.
 * Ces polices ne sont donc chargees que par les pages qui les appliquent via
 * leur className `.variable` (voir marketing.css), jamais depuis le layout
 * racine.
 */

export const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const brandSans = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-brand-sans',
  display: 'swap',
});
