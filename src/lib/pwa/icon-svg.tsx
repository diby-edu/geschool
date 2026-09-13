/**
 * Glyphe de l'icone d'application (PWA + favicon), partage par tous les
 * generateurs next/og pour n'avoir qu'un seul dessin a maintenir. Un
 * mortier de graduation simple : reconnaissable, independant du nom de
 * plateforme (configurable via NEXT_PUBLIC_PLATFORM_NAME) et sans
 * dependance a un jeu d'icones externe.
 */
export function CapGlyph({ size, color = '#ffffff' }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path d="M50 22 L90 40 L50 58 L10 40 Z" fill={color} />
      <path d="M28 48 L28 66 C28 66 37 76 50 76 C63 76 72 66 72 66 L72 48 L50 58 Z" fill={color} opacity={0.92} />
      <line x1="82" y1="40" x2="82" y2="64" stroke={color} strokeWidth={4} strokeLinecap="round" />
      <circle cx="82" cy="68" r="4.5" fill={color} />
    </svg>
  );
}

export const BRAND_BLUE = '#3f4bc4';
export const BRAND_GRADIENT = 'linear-gradient(135deg, #4a44e0 0%, #6d7cff 100%)';
