import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * Manifeste d'application web (PWA) : rend l'app installable (icone sur
 * l'ecran d'accueil, plein ecran sans barre d'adresse). Next.js sert ce
 * fichier a /manifest.webmanifest et injecte lui-meme la balise <link>.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = publicEnv.NEXT_PUBLIC_PLATFORM_NAME;
  return {
    name,
    short_name: name,
    description: "Plateforme de gestion d'etablissements scolaires",
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8f5',
    theme_color: '#4a44e0',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
