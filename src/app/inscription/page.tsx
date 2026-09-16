import type { Metadata } from 'next';
import Link from 'next/link';
import { publicEnv } from '@/lib/env';
import { displayFont, brandSans } from '@/lib/fonts';
import { SignupWizard } from '@/features/onboarding/components/SignupWizard';
import '@/app/marketing.css';

export const metadata: Metadata = { title: `Inscrire mon établissement — ${publicEnv.NEXT_PUBLIC_PLATFORM_NAME}` };

export default function InscriptionPage() {
  return (
    <div className={`mkt ${displayFont.variable} ${brandSans.variable}`}>
      <div className="mkt-aurora">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="mkt-z">
        <header className="mkt-nav">
          <Link href="/" className="mkt-logo mkt-display">
            {publicEnv.NEXT_PUBLIC_PLATFORM_NAME}
          </Link>
          <Link href="/login" className="mkt-ghost">
            Un compte existe déjà ? Connexion
          </Link>
        </header>
        <SignupWizard />
      </div>
    </div>
  );
}
