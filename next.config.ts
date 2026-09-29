import os from 'node:os';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * En-tetes de securite appliques a toutes les reponses.
 *
 * Content-Security-Policy n'est PAS defini ici : il sera ajoute au lot 3, une
 * fois connus les domaines reellement contactes (Supabase, Storage). Une CSP
 * posee trop tot est systematiquement desactivee au premier faux positif.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

/**
 * Adresses d'où l'on a le droit d'ouvrir l'application en développement.
 *
 * Next.js refuse ses ressources internes (rechargement à chaud, chargement des
 * composants client) à une page servie depuis une adresse absente de cette
 * liste. Le symptôme est sournois : la page s'affiche normalement — elle est
 * rendue par le serveur — mais plus rien ne réagit, car le code client n'est
 * jamais chargé. On a vu le cas sur http://127.0.0.1:3000.
 *
 * On y met donc TOUJOURS les adresses locales, puis les adresses IPv4 de ce
 * poste sur le réseau (ex. 192.168.1.25) pour ouvrir l'application depuis un
 * téléphone du même Wi-Fi. La liste est calculée au démarrage : elle suit un
 * changement d'adresse attribuée par la box, et redémarrer `pnpm dev` suffit à
 * la rafraîchir. Sans effet en production.
 */
const loopbackOrigins = ['localhost', '127.0.0.1', '[::1]'];

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  // 169.254.x.x : adresse d'auto-configuration, signe que la box n'a rien
  // attribué. Elle n'est joignable par aucun téléphone, inutile de l'autoriser.
  .filter((a) => !a!.address.startsWith('169.254.'))
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...loopbackOrigins, ...lanAddresses],

  // Build autonome : indispensable au deploiement par artefact (ADR-014).
  // La CI compile, le VPS ne fait que recevoir .next/standalone.
  output: 'standalone',

  reactStrictMode: true,

  // Ne jamais divulguer la stack technique
  poweredByHeader: false,

  // Ne pas generer AGENTS.md / CLAUDE.md a chaque `next dev` : ce sont des
  // artefacts, pas du code source du projet.
  agentRules: false,

  // Un build ne doit jamais passer malgre une erreur de type.
  typescript: { ignoreBuildErrors: false },
  // NB : Next 16 a retire l'option `eslint` de la configuration. Le lint est
  // desormais une etape a part entiere — il tourne dans `pnpm verify` et en CI,
  // avant le build.

  experimental: {
    // Server Actions : plafond aligne sur UPLOAD_MAX_SIZE_MB
    serverActions: { bodySizeLimit: '10mb' },
  },

  images: {
    // Les photos d'eleves et logos viennent de Supabase Storage
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
