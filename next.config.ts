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

const nextConfig: NextConfig = {
  // Build autonome : indispensable au deploiement par artefact (ADR-014).
  // La CI compile, le VPS ne fait que recevoir .next/standalone.
  output: 'standalone',

  reactStrictMode: true,

  // Ne jamais divulguer la stack technique
  poweredByHeader: false,

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
