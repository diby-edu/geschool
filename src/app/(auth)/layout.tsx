import Link from 'next/link';
import { publicEnv } from '@/lib/env';
import { displayFont, brandSans } from '@/lib/fonts';
import '@/app/marketing.css';

/**
 * Meme decor que la vitrine (aurore, polices) pour une premiere impression
 * cohesive, mais le formulaire lui-meme reste la Card sobre habituelle : ses
 * jetons (--surface, --border) s'adaptent deja au theme, et c'est elle qui
 * porte l'accessibilite du clavier (SubmitButton, focus visible, etc).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mkt ${displayFont.variable} ${brandSans.variable}`}>
      <div className="mkt-aurora"><i /><i /><i /><i /></div>
      <main className="mkt-z flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <Link href="/" className="mkt-display" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--mkt-brand)', textDecoration: 'none' }}>
              {publicEnv.NEXT_PUBLIC_PLATFORM_NAME}
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
