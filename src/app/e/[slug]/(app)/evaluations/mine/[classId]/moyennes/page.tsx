import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { getMyTaughtClasses, getMySubjectsForClass } from '@/features/teachers/my-scope';
import { listPeriodsForClass } from '@/features/evaluations/refs';
import { computeLiveRanking } from '@/features/evaluations/live-ranking';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { StudentAvatar } from '@/components/ui/student-avatar';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { getCompletionState } from '@/features/grading/completion';
import { completeAveragesAction, reopenAveragesAction, setExemptionAction } from '@/features/grading/actions';
import { isEps, listExemptions } from '@/features/grading/exemptions';
import { listFlags } from '@/features/grading/head-teacher';
import { resolveFlagAction } from '@/features/grading/head-teacher-actions';

export const metadata: Metadata = { title: 'Moyennes et classement' };

const MEDAL_COLOR: Record<number, string> = {
  1: 'oklch(0.75 0.15 85)',
  2: 'oklch(0.75 0.01 250)',
  3: 'oklch(0.62 0.13 55)',
};

export default async function MyClassRankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, classId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'grades.view');
  requireFeature(ctx, 'grades');
  if (!ctx.academicYear) notFound();
  const yearId = ctx.academicYear.id;
  const base = `/e/${slug}/evaluations/mine/${classId}`;

  const classes = await getMyTaughtClasses(ctx);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();

  const [subjects, periods] = await Promise.all([getMySubjectsForClass(ctx, classId), listPeriodsForClass(ctx, yearId, classId)]);
  const periodId = typeof sp.period === 'string' ? sp.period : undefined;
  const period = periodId ? periods.find((p) => p.id === periodId) : undefined;
  const subjectId = typeof sp.subject === 'string' ? sp.subject : subjects.length === 1 ? subjects[0]!.id : undefined;
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined;

  if (!period) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`Moyennes — ${klass.name}`} action={<Link href={base}><Button variant="ghost">Retour</Button></Link>} />
        <EmptyState title="Période manquante" hint="Revenez à l'onglet de la période concernée." />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={`Moyennes — ${klass.name}`} action={<Link href={`${base}?period=${period.id}`}><Button variant="ghost">Retour</Button></Link>} />
        {subjects.length === 0 ? (
          <EmptyState title="Aucune discipline" hint="Aucune matière ne vous est affectée dans cette classe." />
        ) : (
          <ul className="space-y-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <Link href={`${base}/moyennes?period=${period.id}&subject=${s.id}`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [ranking, completion, eps, exempted, flags] = await Promise.all([
    computeLiveRanking(ctx, classId, period.id, subject.id),
    getCompletionState(ctx, classId, subject.id, period.id),
    isEps(ctx, subject.id),
    listExemptions(ctx, period.id, subject.id),
    listFlags(ctx, classId, period.id, subject.id),
  ]);
  const openFlags = flags.filter((f) => f.status === 'OPEN');
  const flagged = new Set(openFlags.map((f) => f.studentId));
  // Seul le professeur d'EPS de la classe déclare une dispense (la base le vérifie).
  const canExempt = eps && completion.assignmentId !== null && completion.phase !== 'FROZEN';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`Moyennes et classement — ${klass.name}`}
        description={`${subject.name} · ${period.name}`}
        action={<Link href={`${base}?period=${period.id}`}><Button variant="ghost">Retour</Button></Link>}
      />

      {sp.exempted ? <Alert tone="success">Élève déclaré dispensé d’EPS pour cette période.</Alert> : null}
      {sp.unexempted ? <Alert tone="info">Dispense retirée : l’élève peut de nouveau recevoir des notes.</Alert> : null}
      {sp.flag ? <Alert tone="success">Signalement réglé : le professeur principal le voit.</Alert> : null}
      {openFlags.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">Signalé par le professeur principal ({openFlags.length})</p>
            <p className="text-[color:var(--muted-foreground)]">
              L’élève vient vous voir. Corrigez sa note s’il y a une erreur, puis validez : « Corrigé » ou « Maintenu ».
            </p>
            <ul className="divide-y rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
              {openFlags.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <b>{f.student}</b>
                  <span className="flex gap-2">
                    <SimpleSubmit small action={resolveFlagAction.bind(null, slug, classId, subject.id, period.id, f.id, 'CORRECTED')} label="Corrigé" />
                    <SimpleSubmit small action={resolveFlagAction.bind(null, slug, classId, subject.id, period.id, f.id, 'MAINTAINED')} label="Maintenu" />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {completion.phaseMessage ? (
        <Alert tone={completion.phase === 'FROZEN' ? 'error' : 'info'}>{completion.phaseMessage}</Alert>
      ) : null}

      {completion.assignmentId && !completion.unavailable ? (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  {completion.completed ? 'Vos moyennes sont déclarées terminées' : 'Avez-vous fini vos moyennes ?'}
                </p>
                <p className="text-[color:var(--muted-foreground)]">
                  {completion.completed
                    ? 'La direction et le professeur principal voient que cette classe et cette matière sont à jour.'
                    : completion.phase === 'FROZEN'
                      ? 'Les notes sont figées : il n’est plus possible de le déclarer.'
                      : completion.missing.length > 0
                        ? `Encore ${completion.missing.length} élève(s) sans moyenne : chaque élève doit avoir une moyenne${eps ? ', ou être dispensé' : ''}.`
                        : 'Chaque élève a une moyenne : vous pouvez le déclarer.'}
                </p>
              </div>
              {completion.completed ? (
                completion.open ? (
                  <SimpleSubmit action={reopenAveragesAction.bind(null, slug, classId, subject.id, period.id)} label="Rouvrir mes moyennes" />
                ) : null
              ) : completion.open && completion.missing.length === 0 ? (
                <SimpleSubmit action={completeAveragesAction.bind(null, slug, classId, subject.id, period.id)} label="J'ai fini mes moyennes" />
              ) : null}
            </div>
            {!completion.completed && completion.missing.length > 0 ? (
              <p className="text-xs text-[color:var(--muted-foreground)]">
                Sans moyenne : {completion.missing.slice(0, 12).map((m) => m.name).join(', ')}
                {completion.missing.length > 12 ? '…' : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Alert tone="info">
        Calculé à partir de toutes les évaluations saisies, y compris celles en brouillon. La clôture d&apos;une
        évaluation (réservée à l&apos;administration) gèle sa saisie ; elle ne conditionne pas ce calcul.
      </Alert>

      {ranking.rows.length === 0 ? (
        <EmptyState title="Aucun élève inscrit" />
      ) : (
        // Meme ecran que la saisie des notes (meme avatar, meme ordre
        // alphabetique, meme ligne par eleve) : seule la note editable devient
        // Moyenne + Rang, en lecture seule.
        <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          {ranking.rows.map((r) => (
            <li
              key={r.studentId}
              className="flex items-center gap-3 px-3 py-2.5"
              style={flagged.has(r.studentId) ? { backgroundColor: 'color-mix(in oklch, var(--color-warning) 18%, transparent)' } : undefined}
            >
              <StudentAvatar name={r.name} photoUrl={r.photoUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{r.matricule}</span>
              </span>
              {canExempt ? (
                <SimpleSubmit
                  small
                  action={setExemptionAction.bind(null, slug, classId, subject.id, period.id, r.studentId, !exempted.has(r.studentId))}
                  label={exempted.has(r.studentId) ? 'Retirer la dispense' : 'Dispensé'}
                />
              ) : null}
              {exempted.has(r.studentId) ? (
                <span className="shrink-0 text-sm italic text-[color:var(--muted-foreground)]">Dispensé</span>
              ) : (
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{r.average === null ? '—' : r.average.toLocaleString('fr-FR')}</span>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">/ 20</span>
                </span>
              )}
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: r.rank && MEDAL_COLOR[r.rank] ? MEDAL_COLOR[r.rank] : 'var(--muted-foreground)' }}
              >
                {r.rank ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
          {ranking.assessments.length} évaluation(s) prise(s) en compte dans cette matière pour cette période.
        </CardContent>
      </Card>
    </div>
  );
}
