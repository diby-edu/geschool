import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { requirePageAccess } from '@/lib/permissions/guard';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { updateIdentityAction } from '@/features/settings/actions';
import { IdentityForm } from '@/features/settings/components/IdentityForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Identité de l’école' };

export default async function SchoolIdentityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'settings.update');

  const supabase = await createClient();
  const { data: school } = await supabase
    .from('schools')
    .select('name, short_name, director_name, registration_number, address, neighborhood, city, phone_e164, email, website, education_tracks')
    .eq('id', ctx.school.id)
    .maybeSingle();
  if (!school) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {sp.updated === '1' ? <Alert tone="success">Identité enregistrée.</Alert> : null}
      <PageHeader
        title="Identité de l’école"
        description="Ordres d’enseignement, nom, directeur et coordonnées de l’établissement."
        action={
          <Link href={`/e/${slug}/parametres`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux paramètres
          </Link>
        }
      />

      <Card>
        <CardContent className="grid gap-x-8 gap-y-2 py-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Code école</span>
            <span className="font-mono">{ctx.school.loginCode}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Adresse de l’espace</span>
            <span className="font-mono">/e/{ctx.school.slug}</span>
          </div>
          <p className="text-xs text-[color:var(--muted-foreground)] sm:col-span-2">
            Le code école et l’adresse de l’espace ne changent jamais : vos enseignants et parents s’y connectent.
          </p>
        </CardContent>
      </Card>

      <IdentityForm
        key={String(sp.updated ?? '')}
        action={updateIdentityAction.bind(null, slug)}
        educationTracks={(school.education_tracks ?? []) as string[]}
        defaultValues={{
          name: school.name,
          shortName: school.short_name ?? '',
          directorName: school.director_name ?? '',
          registrationNumber: school.registration_number ?? '',
          address: school.address ?? '',
          neighborhood: school.neighborhood ?? '',
          city: school.city ?? '',
          phone: school.phone_e164 ? formatPhoneForDisplay(school.phone_e164, ctx.school.countryCode) : '',
          email: school.email ?? '',
          website: school.website ?? '',
        }}
      />
    </div>
  );
}
