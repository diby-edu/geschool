import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny, requireFeature } from '@/lib/permissions/guard';
import { listIncidentTypes, listStudentOptions } from '@/features/discipline/queries';
import { reportIncidentAction } from '@/features/discipline/actions';
import { IncidentForm } from '@/features/discipline/components/IncidentForms';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Signaler un incident' };

export default async function NewIncidentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['discipline.create', 'discipline.view']);
  requireFeature(ctx, 'discipline');

  const [types, students] = await Promise.all([listIncidentTypes(ctx), listStudentOptions(ctx)]);
  const active = types.filter((t) => t.isActive);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Signaler un incident"
        description="Ce qui s’est passé, pour quel élève, et quand."
        action={
          <Link href={`/e/${slug}/discipline`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          title="Aucun motif d’incident"
          hint="Définissez d’abord les motifs de votre règlement intérieur : retard, insolence, bagarre…"
          action={{ href: `/e/${slug}/discipline/config`, label: 'Définir les motifs' }}
        />
      ) : students.length === 0 ? (
        <EmptyState title="Aucun élève inscrit" hint="Inscrivez des élèves avant de signaler un incident." />
      ) : (
        <IncidentForm
          action={reportIncidentAction.bind(null, slug)}
          students={students}
          types={active.map((t) => ({ id: t.id, name: t.name, points: t.points }))}
          today={today}
        />
      )}

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Signaler n’est pas punir : la sanction, si elle a lieu, est décidée ensuite par la vie scolaire.
      </p>
      <Link href={`/e/${slug}/discipline`}>
        <Button variant="ghost">Voir les incidents</Button>
      </Link>
    </div>
  );
}
