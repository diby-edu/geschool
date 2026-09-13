import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SchoolLoginForm } from '@/features/auth/components/SchoolLoginForm';
import { resolveSchoolBySlug } from '@/features/auth/service';
import { displayFont, brandSans } from '@/lib/fonts';
import '@/app/marketing.css';

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
    <div className={`mkt ${displayFont.variable} ${brandSans.variable}`}>
      <div className="mkt-aurora"><i /><i /><i /><i /></div>
      <main className="mkt-z flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <p className="mkt-display" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--mkt-brand)' }}>
              {school.name}
            </p>
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
    </div>
  );
}
