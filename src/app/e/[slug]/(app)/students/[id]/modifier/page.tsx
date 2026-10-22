import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { loadStudentForEdit } from '@/features/students/queries';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';
import { addGuardianAction, detachGuardianAction, updateGuardianAction, updateStudentAction } from '@/features/students/edit-actions';
import { AddGuardianForm, GuardianCard, StudentIdentityForm } from '@/features/students/components/StudentEditForms';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Modifier l’élève' };

/**
 * Corriger le dossier d'un élève et ses responsables légaux après l'inscription.
 * Chaque partie s'ouvre avec son propre droit : « Modifier le dossier d'un élève »,
 * « Modifier / Enregistrer / Supprimer un responsable légal ».
 */
export default async function EditStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['students.update', 'guardians.update', 'guardians.create', 'guardians.delete']);

  const [data, policy] = await Promise.all([loadStudentForEdit(ctx, id), enrollmentPolicy(ctx)]);
  if (!data) notFound();
  const { student, guardians } = data;

  const canStudent = hasPermission(ctx, 'students.update');
  const canUpdateG = hasPermission(ctx, 'guardians.update');
  const canAddG = hasPermission(ctx, 'guardians.create');
  const canDetachG = hasPermission(ctx, 'guardians.delete');
  const fiche = `/e/${slug}/students/${id}`;
  const titre = (t: string) => <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">{t}</h2>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {sp.eleve === '1' ? <Alert tone="success">Dossier de l’élève corrigé.</Alert> : null}
      {sp.responsable === '1' ? <Alert tone="success">Responsable modifié.</Alert> : null}
      {sp.ajoute === '1' ? <Alert tone="success">Responsable ajouté.</Alert> : null}
      {sp.retire === '1' ? <Alert tone="success">Responsable retiré de cet élève.</Alert> : null}

      <PageHeader
        title={`Modifier : ${student.last_name.toUpperCase()} ${student.first_name}`}
        description="Chaque correction est inscrite au journal, avec l’ancienne et la nouvelle valeur."
        action={
          <Link href={fiche} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour à la fiche
          </Link>
        }
      />

      {canStudent ? (
        <section className="space-y-3">
          {titre('Élève')}
          <StudentIdentityForm action={updateStudentAction.bind(null, slug, id)} student={student} matriculeRequired={matriculeIsRequired(policy)} />
        </section>
      ) : null}

      <section className="space-y-3">
        {titre('Responsables légaux')}
        {guardians.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucun responsable rattaché.</p>
            </CardContent>
          </Card>
        ) : (
          guardians.map((g) => (
            <GuardianCard
              key={g.id}
              guardian={g}
              update={canUpdateG ? updateGuardianAction.bind(null, slug, id, g.id) : undefined}
              detach={canDetachG ? detachGuardianAction.bind(null, slug, id, g.id) : undefined}
            />
          ))
        )}
      </section>

      {canAddG && guardians.length < 4 ? (
        <section className="space-y-3">
          {titre('Ajouter un responsable')}
          <AddGuardianForm action={addGuardianAction.bind(null, slug, id)} />
        </section>
      ) : null}
    </div>
  );
}
