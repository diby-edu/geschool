import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FirstLoginForm } from '@/features/auth/components/FirstLoginForm';

export const metadata: Metadata = { title: 'Définir votre mot de passe' };

export default async function FirstLoginPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Securisez votre compte</CardTitle>
        <CardDescription>
          Pour votre sécurité, définissez votre mot de passe personnel avant d&apos;accéder à
          votre espace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FirstLoginForm />
      </CardContent>
    </Card>
  );
}
