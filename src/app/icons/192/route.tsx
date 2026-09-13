import { ImageResponse } from 'next/og';
import { CapGlyph, BRAND_GRADIENT } from '@/lib/pwa/icon-svg';

// Runtime Node par defaut (deploiement autonome via PM2, pas Vercel Edge) :
// ImageResponse fonctionne aussi bien hors du runtime edge.
export async function GET() {
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
          borderRadius: 40,
        }}
      >
        <CapGlyph size={132} />
      </div>
    ),
    { width: 192, height: 192 },
  );
}
