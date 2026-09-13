import { ImageResponse } from 'next/og';
import { CapGlyph, BRAND_GRADIENT } from '@/lib/pwa/icon-svg';

// iOS applique lui-meme les coins arrondis a l'icone d'ecran d'accueil : le
// fond doit rester carre et opaque, sans rayon ni transparence.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: BRAND_GRADIENT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CapGlyph size={122} />
      </div>
    ),
    { ...size },
  );
}
