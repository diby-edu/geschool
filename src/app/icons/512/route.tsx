import { ImageResponse } from 'next/og';
import { CapGlyph, BRAND_GRADIENT } from '@/lib/pwa/icon-svg';

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
          borderRadius: 108,
        }}
      >
        <CapGlyph size={352} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
