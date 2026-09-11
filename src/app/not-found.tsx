import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
        404
      </p>
      <h1 className="text-xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="max-w-sm text-sm text-[color:var(--muted-foreground)]">{t('notFoundBody')}</p>
      <Link href="/" className="mt-2 text-sm text-[color:var(--color-brand)] hover:underline">
        Retour a l&apos;accueil
      </Link>
    </main>
  );
}
