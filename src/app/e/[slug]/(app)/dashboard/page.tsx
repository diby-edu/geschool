import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { getDashboardData } from '@/features/dashboard/queries';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Tableau de bord' };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value.toLocaleString('fr-FR')}</p>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const data = await getDashboardData(ctx);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          {ctx.school.name}
          {ctx.academicYear ? ` · ${ctx.academicYear.name}` : ''}
        </p>
      </div>

      {data.kind === 'staff' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Eleves" value={data.students} />
          <Stat label="Enseignants" value={data.teachers} />
          <Stat label="Classes" value={data.classes} />
        </div>
      ) : null}

      {data.kind === 'teacher' ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Mes classes
          </h2>
          {data.classes.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Aucune classe ne vous est encore affectee.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {data.classes.map((c) => (
                <li key={c.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between py-3">
                      <span className="font-medium">{c.name}</span>
                      {c.level ? (
                        <span className="text-sm text-[color:var(--muted-foreground)]">
                          {c.level}
                        </span>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {data.kind === 'family' ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            {data.students.length > 1 ? 'Mes enfants' : 'Mon dossier'}
          </h2>
          {data.students.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Aucun dossier accessible pour le moment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {data.students.map((s) => (
                <li key={s.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between py-3">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
                        {s.matricule}
                      </span>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
