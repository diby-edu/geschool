import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SchoolLoginForm } from '@/features/auth/components/SchoolLoginForm';
import { resolveSchoolBySlug } from '@/features/auth/service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const school = await resolveSchoolBySlug(slug);
  return { title: school ? `Connexion — ${school.name}` : 'Connexion' };
}

export default async function SchoolLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const school = await resolveSchoolBySlug(slug);
  // Slug inconnu : 404, on ne confirme pas l'existence d'un etablissement.
  if (!school) notFound();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-tight">{school.name}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Espace de l&apos;etablissement</CardTitle>
            <CardDescription>
              Parents, eleves et personnel. Utilisez votre telephone, votre matricule ou votre
              email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SchoolLoginForm slug={slug} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
