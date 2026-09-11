import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { locale } from '@/i18n/request';
import { publicEnv } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: publicEnv.NEXT_PUBLIC_PLATFORM_NAME,
    template: `%s · ${publicEnv.NEXT_PUBLIC_PLATFORM_NAME}`,
  },
  description: "Plateforme de gestion d'établissements scolaires",
  // Aucune donnée scolaire ne doit se retrouver dans un moteur de recherche.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // L'appel et la consultation se font sur téléphone : le zoom doit rester
  // possible. Le bloquer serait un défaut d'accessibilité.
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
