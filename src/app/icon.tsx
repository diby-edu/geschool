import { ImageResponse } from 'next/og';
import { CapGlyph, BRAND_GRADIENT } from '@/lib/pwa/icon-svg';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <CapGlyph size={22} />
      </div>
    ),
    { ...size },
  );
}
