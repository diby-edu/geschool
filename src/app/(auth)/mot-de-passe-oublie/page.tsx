import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PasswordResetForm } from '@/features/auth/components/PasswordResetForm';

export const metadata: Metadata = { title: 'Mot de passe oublie' };

export default function PasswordResetPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe oublie</CardTitle>
        <CardDescription>Un lien de reinitialisation vous sera envoye par email.</CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordResetForm />
      </CardContent>
    </Card>
  );
}
