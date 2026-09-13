import { ImageResponse } from 'next/og';
import { CapGlyph, BRAND_GRADIENT } from '@/lib/pwa/icon-svg';

// Icone "maskable" (spec W3C) : fond plein cadre, sans coins arrondis — c'est
// le systeme d'exploitation qui applique sa propre forme (cercle, carre
// arrondi...). Le glyphe reste dans la zone de securite centrale (~80%) pour
// ne jamais etre coupe par ce masque, quelle que soit la forme choisie.
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
        }}
      >
        <CapGlyph size={280} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
