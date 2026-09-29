import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { LoginTabs } from '@/features/auth/components/LoginTabs';
import { SCHOOL_CODE_COOKIE } from '@/features/auth/constants';

export const metadata: Metadata = { title: 'Connexion' };

const CODE_RE = /^\d{6}$/;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; code?: string }>;
}) {
  const { next, code } = await searchParams;

  // Le code ecole vient du lien recu par SMS (?code=482913), sinon de l'appareil
  // (cookie pose a la derniere connexion reussie).
  const saved = (await cookies()).get(SCHOOL_CODE_COOKIE)?.value;
  const initialCode = code && CODE_RE.test(code) ? code : saved && CODE_RE.test(saved) ? saved : '';

  return <LoginTabs next={next} initialCode={initialCode} initialTab={initialCode ? 'membres' : 'direction'} />;
}
