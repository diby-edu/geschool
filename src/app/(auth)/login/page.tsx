import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmailLoginForm } from '@/features/auth/components/EmailLoginForm';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Personnel et administration.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmailLoginForm next={next} />
      </CardContent>
    </Card>
  );
}
