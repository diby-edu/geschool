import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getStudentDetail } from '@/features/students/queries';
import { listTransfers } from '@/features/students/enrollment-changes';
import { enrollmentStatusLabel } from '@/features/students/enrollment-changes-types';
import { listYearClasses } from '@/features/assignments/queries';
import { hasPermission } from '@/lib/permissions';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { SchoolingActions } from '@/features/students/components/SchoolingActions';
import {
  transferStudentAction,
  withdrawStudentAction,
  reinstateStudentAction,
} from '@/features/students/actions';
import { schoolToday } from '@/features/dashboard/time';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Fiche élève' };

/** Un statut jamais renseigné se dit, il ne se devine pas. */
const ASSIGNED_LABEL = (v: boolean | null): string =>
  v === null ? 'Non renseigné' : v ? 'Affecté' : 'Non affecté';

const REL: Record<string, string> = {
  FATHER: 'Père',
  MOTHER: 'Mère',
  TUTOR: 'Tuteur',
  LEGAL_GUARDIAN: 'Responsable légal',
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
  const { student, guardians, enrollment } = detail;

  // Le parcours de l'annee et les classes ou l'on peut le deplacer : lus
  // seulement quand une annee est active, sinon il n'y a pas de scolarite.
  const [transfers, classes] = ctx.academicYear
    ? await Promise.all([listTransfers(ctx, id, ctx.academicYear.id), listYearClasses(ctx, ctx.academicYear.id)])
    : [[], []];
  const canTransfer = hasPermission(ctx, 'enrollments.transfer');
  const canWithdraw = hasPermission(ctx, 'enrollments.withdraw');
  const hasLeft = enrollment !== null && enrollment.status !== 'ENROLLED';
  const enrolled = sp.enrolled === '1';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {typeof sp.avertissement === 'string' ? <Alert tone="error">{sp.avertissement}</Alert> : null}
      {sp.transfere === '1' ? <Alert tone="success">Élève changé de classe.</Alert> : null}
      {sp.parti === '1' ? <Alert tone="success">Départ enregistré.</Alert> : null}
      {sp.revenu === '1' ? <Alert tone="success">L’élève a repris sa place.</Alert> : null}
      {enrolled ? (
        <Alert tone="success">
          Inscription enregistrée. Les comptes ont été créés ; transmettez les identifiants depuis
          le module « Gestion des accès ».
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
          Scolarité
        </h2>
        <Card>
          <CardContent className="py-3">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--muted-foreground)]">Classe</dt>
                <dd className="font-medium">{enrollment?.className ?? 'Non inscrit cette année'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--muted-foreground)]">Statut</dt>
                <dd className="font-medium">{ASSIGNED_LABEL(student.is_state_assigned)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--muted-foreground)]">Situation</dt>
                <dd className="font-medium">
                  {enrollment ? enrollmentStatusLabel(enrollment.status) : '—'}
                  {enrollment?.leftOn ? ` le ${enrollment.leftOn}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--muted-foreground)]">Redoublant</dt>
                <dd className="font-medium">{enrollment ? (enrollment.isRepeating ? 'Oui' : 'Non') : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--muted-foreground)]">Né(e) le</dt>
                <dd className="font-medium">
                  {student.birth_date ?? '—'}
                  {student.birth_place ? ` à ${student.birth_place}` : ''}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {enrollment && (canTransfer || canWithdraw) ? (
        hasLeft ? (
          <div className="rounded-[--radius-card] border border-dashed p-4">
            <p className="mb-2 text-sm">
              Cet élève a quitté l’établissement
              {enrollment.leftReason ? ` — ${enrollment.leftReason}` : ''}.
            </p>
            {canWithdraw ? (
              <SimpleSubmit action={reinstateStudentAction.bind(null, slug, id)} label="Annuler le départ" small />
            ) : null}
          </div>
        ) : (
          <SchoolingActions
            transferAction={transferStudentAction.bind(null, slug, id)}
            withdrawAction={withdrawStudentAction.bind(null, slug, id)}
            classes={classes}
            currentClassId={enrollment.classId}
            today={schoolToday(ctx.school.timezone)}
          />
        )
      ) : null}

      {transfers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Parcours de l’année
          </h2>
          <ul className="space-y-1.5 text-sm">
            {transfers.map((t, i) => (
              <li key={`${t.effectiveOn}-${i}`} className="text-[color:var(--muted-foreground)]">
                <span className="tabular-nums">{t.effectiveOn}</span> · {t.fromClassName ?? '—'} →{' '}
                <span className="font-medium text-[color:var(--foreground)]">{t.toClassName ?? '—'}</span>
                {t.reason ? ` — ${t.reason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Responsables légaux
        </h2>
        {guardians.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucun responsable rattaché.</p>
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
