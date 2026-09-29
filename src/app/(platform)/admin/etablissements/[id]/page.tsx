import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listSchoolFeatures } from '@/features/platform-schools/features';
import { listSchoolsForAdmin } from '@/features/platform/admin';
import { SchoolStatusForm } from '@/features/platform/components/SchoolStatusForm';
import { setSchoolFeatureAction } from '@/features/platform-schools/actions';
import { FeatureToggle } from '@/features/platform-schools/components/FeatureToggle';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Établissement' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};

/**
 * Fiche d'un établissement, vue de la plateforme : son identité, et surtout les
 * MODULES qu'il a. C'est ici que se décide ce qui est vendu — l'établissement,
 * lui, ne peut pas se les attribuer.
 */
export default async function PlatformSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: school } = await supabase
    .from('schools')
    .select('id, slug, name, status, city, education_tracks, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!school) notFound();

  const [features, all] = await Promise.all([listSchoolFeatures(id), listSchoolsForAdmin()]);
  const off = features.filter((f) => !f.enabled).length;
  const row = all.find((s) => s.id === id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={school.name}
        description={`/e/${school.slug} · ${STATUS_LABEL[school.status] ?? school.status}`}
        action={
          <div className="flex gap-2">
            <Link href={`/e/${school.slug}`}>
              <Button variant="secondary">Ouvrir son espace</Button>
            </Link>
            <Link href={`/admin/journal?ecole=${school.id}`}>
              <Button variant="secondary">Journal</Button>
            </Link>
            <Link href={`/admin/facturation/${school.id}`}>
              <Button variant="secondary">Abonnement</Button>
            </Link>
            <Link href="/admin/etablissements">
              <Button variant="ghost">Retour</Button>
            </Link>
          </div>
        }
      />

      {typeof sp.module === 'string' ? <Alert tone="success">Module mis à jour.</Alert> : null}

      <Card>
        <CardContent className="grid gap-x-8 gap-y-2 py-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Ville</span>
            <span>{school.city ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Ordres d’enseignement</span>
            <span>{(school.education_tracks ?? []).join(', ') || '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Créé le</span>
            <span>{String(school.created_at).slice(0, 10).split('-').reverse().join('/')}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Modules coupés</span>
            <span className="tabular-nums">{off}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Élèves</span>
            <span className="tabular-nums">{row?.students ?? 0}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted-foreground)]">Comptes actifs</span>
            <span className="tabular-nums">{row?.members ?? 0}</span>
          </div>
          <div className="flex justify-between gap-3 sm:col-span-2">
            <span className="text-[color:var(--muted-foreground)]">Abonnement</span>
            <span>
              {row?.subscription
                ? `${row.subscription.plan} · ${row.subscription.status}${
                    row.subscription.endsOn ? ` · échéance ${String(row.subscription.endsOn).slice(0, 10).split('-').reverse().join('/')}` : ''
                  }`
                : 'Aucun'}
            </span>
          </div>
        </CardContent>
      </Card>

      {typeof sp.statut === 'string' ? <Alert tone="success">État de l’établissement mis à jour.</Alert> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          État de l’établissement
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Suspendre bloque toute écriture dans son espace — la base le refuse, pas seulement l’écran — sans rien
          supprimer. L’école retrouve tout à la réactivation.
        </p>
        <SchoolStatusForm schoolId={school.id} current={school.status} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Modules de l’établissement
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Un module coupé disparaît du menu et de la page Paramètres de l’école, et ses écrans deviennent introuvables.
          Le socle — élèves, classes, structure, années, rôles et accès — ne se coupe pas.
        </p>
        <div className="space-y-2">
          {features.map((f) => (
            <FeatureToggle key={f.code} row={f} action={setSchoolFeatureAction.bind(null, school.id, f.code)} />
          ))}
        </div>
      </section>
    </div>
  );
}
