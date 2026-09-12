import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getStudentDetail } from '@/features/students/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Fiche eleve' };

const REL: Record<string, string> = {
  FATHER: 'Pere',
  MOTHER: 'Mere',
  TUTOR: 'Tuteur',
  LEGAL_GUARDIAN: 'Responsable legal',
  SIBLING: 'Fratrie',
  OTHER: 'Autre',
};

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'students.view');

  const detail = await getStudentDetail(ctx, id);
  if (!detail) notFound();
  const { student, guardians } = detail;
  const enrolled = sp.enrolled === '1';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {enrolled ? (
        <Alert tone="success">
          Inscription enregistree. Les comptes ont ete crees ; transmettez les identifiants depuis
          le module « Gestion des acces ».
        </Alert>
      ) : null}

      <PageHeader
        title={`${student.last_name.toUpperCase()} ${student.first_name}`}
        description={`Matricule ${student.matricule}`}
        action={
          <Link href={`/e/${slug}/students`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Responsables legaux
        </h2>
        {guardians.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucun responsable rattache.</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {guardians.map((g) => (
              <li key={g.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{g.name}</span>
                      {g.isPrimary ? (
                        <span className="ml-2 rounded-full bg-[color:var(--color-brand-muted)] px-2 py-0.5 text-xs text-[color:var(--color-brand)]">
                          Contact principal
                        </span>
                      ) : null}
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {REL[g.relationship] ?? g.relationship} · {g.phone}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
