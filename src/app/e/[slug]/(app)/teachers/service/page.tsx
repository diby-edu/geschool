import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { readServiceDefaults } from '@/features/teachers/service-defaults';
import { schoolSessionMinutes } from '@/features/teachers/service';
import { ServiceDefaultsForm } from '@/features/teachers/components/ServiceDefaultsForm';
import { saveServiceDefaultsAction } from '@/features/teachers/actions';

export const metadata: Metadata = { title: 'Service des enseignants' };

/**
 * Le service hebdomadaire par défaut, réglé une fois pour toute l'école.
 *
 * Sans cet écran, une école de cent soixante-dix enseignants saisirait cent
 * soixante-dix plafonds à la main. Ici elle dit une fois ce que fait un
 * permanent, un vacataire, un stagiaire.
 */
export default async function TeacherServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.view');

  const [defaults, sessionMinutes] = await Promise.all([readServiceDefaults(ctx), schoolSessionMinutes(ctx)]);
  const canEdit = hasPermission(ctx, 'settings.update');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Service des enseignants"
        description="Le nombre de séances qu’assure un enseignant chaque semaine, selon son contrat."
        action={
          <Link href={`/e/${slug}/teachers`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux enseignants
          </Link>
        }
      />

      {typeof sp.enregistre === 'string' ? <Alert tone="success">Valeurs par défaut enregistrées.</Alert> : null}

      <ServiceDefaultsForm
        action={saveServiceDefaultsAction.bind(null, slug)}
        defaults={defaults}
        sessionMinutes={sessionMinutes}
        canEdit={canEdit}
      />

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Ces valeurs servent de point de départ. Le service saisi sur la fiche d’un enseignant l’emporte toujours, et la
        grille d’affectation signale en rouge celui qui dépasse son plafond — avant la génération de l’emploi du temps,
        pas après son échec.
      </p>
    </div>
  );
}
