import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listPeriodsForClass } from '@/features/evaluations/refs';
import { buildMatrix, myHeadClasses } from '@/features/reporting/matrix';
import { MatrixTable } from '@/features/reporting/components/MatrixTable';
import { certificationBlockers, classTermStatus, listFlags, FLAG_LABEL } from '@/features/grading/head-teacher';
import { cancelFlagAction, certifyClassAction, flagGradeAction } from '@/features/grading/head-teacher-actions';
import { termPhaseMessage, type TermPhase } from '@/features/academic-years/grading';
import { schoolToday } from '@/features/dashboard/time';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Professeur principal' };

const dt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * L'espace du professeur principal : la matrice de SA classe, vérifiée avec
 * les élèves. Un clic sur une moyenne la signale au professeur de la matière ;
 * quand toutes les matières sont déclarées finies et tous les signalements
 * réglés, il certifie la classe.
 */
export default async function HeadTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  if (!ctx.academicYear) notFound();

  const classes = await myHeadClasses(ctx);
  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Professeur principal" />
        <EmptyState
          title="Vous n’êtes professeur principal d’aucune classe"
          hint="La direction désigne le professeur principal sur la fiche de chaque classe."
        />
      </div>
    );
  }
  const classId = typeof sp.class === 'string' && classes.some((c) => c.id === sp.class) ? sp.class : classes[0]!.id;
  const klass = classes.find((c) => c.id === classId)!;

  // Périodes de l'ordre de la classe ; par défaut, la dernière commencée.
  const periods = await listPeriodsForClass(ctx, ctx.academicYear.id, classId);
  const supabase = await createClient();
  const { data: dates } = await supabase
    .from('academic_periods')
    .select('id, starts_on, grades_stop_on, student_check_ends_on, head_check_ends_on')
    .eq('school_id', ctx.school.id)
    .in('id', periods.map((p) => p.id));
  const today = schoolToday(ctx.school.timezone);
  const byId = new Map((dates ?? []).map((d) => [d.id, d]));
  const started = periods.filter((p) => (byId.get(p.id)?.starts_on ?? '9999') <= today);
  const periodId =
    typeof sp.period === 'string' && periods.some((p) => p.id === sp.period)
      ? sp.period
      : (started.at(-1) ?? periods[0])?.id;
  if (!periodId) {
    return <EmptyState title="Aucune période" hint="Les périodes de l’année ne sont pas encore créées." />;
  }
  const period = periods.find((p) => p.id === periodId)!;
  const d = byId.get(periodId);

  const [matrix, flags, blockers, status, { data: phaseRaw }] = await Promise.all([
    buildMatrix(ctx, classId, periodId),
    listFlags(ctx, classId, periodId),
    certificationBlockers(ctx, classId, periodId),
    classTermStatus(ctx, classId, periodId),
    supabase.rpc('term_phase' as never, { p_period: periodId } as never),
  ]);
  const phase = ((phaseRaw as string | null) ?? 'OPEN') as TermPhase;
  const certified = status.certifiedAt !== null;
  const unlocked = status.unlockedAt !== null && !certified;
  const canAct = !certified && (phase !== 'FROZEN' || unlocked);

  const flagMap: Record<string, 'OPEN' | 'CORRECTED' | 'MAINTAINED'> = {};
  for (const f of flags) {
    if (f.status !== 'CANCELLED') flagMap[`${f.studentId}:${f.subjectId}`] = f.status;
  }
  const notDone = blockers.filter((b) => b.kind === 'NOT_DONE');
  const openFlags = blockers.filter((b) => b.kind === 'OPEN_FLAG');
  const base = `/e/${slug}/professeur-principal`;
  const here = `${base}?class=${classId}&period=${periodId}`;
  const message = d ? termPhaseMessage(d, today) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Professeur principal — ${klass.name}`}
        description={`${period.name} · ${matrix.rows.length} élèves`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/e/${slug}/matrice?class=${classId}&period=${periodId}&retour=${encodeURIComponent(here)}`}>
              <Button variant="secondary" size="sm">Imprimer la matrice</Button>
            </Link>
            <a href={`/e/${slug}/api/matrice?class=${classId}&period=${periodId}`}>
              <Button variant="ghost" size="sm">Excel</Button>
            </a>
          </div>
        }
      />

      <nav className="flex flex-wrap gap-2 text-sm">
        {classes.length > 1
          ? classes.map((c) => (
              <Link
                key={c.id}
                href={`${base}?class=${c.id}&period=${periodId}`}
                className={`rounded-full border px-3 py-1 ${c.id === classId ? 'font-semibold' : ''}`}
                style={c.id === classId ? { backgroundColor: 'var(--color-brand-muted)' } : undefined}
              >
                {c.name}
              </Link>
            ))
          : null}
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`${base}?class=${classId}&period=${p.id}`}
            className={`rounded-full border px-3 py-1 ${p.id === periodId ? 'font-semibold' : ''}`}
            style={p.id === periodId ? { backgroundColor: 'var(--color-brand-muted)' } : undefined}
          >
            {p.name}
          </Link>
        ))}
      </nav>

      {sp.certified ? <Alert tone="success">Classe certifiée. La direction le voit, et les notes de la classe sont figées.</Alert> : null}
      {message ? <Alert tone={phase === 'FROZEN' ? 'error' : 'info'}>{message}</Alert> : null}

      <Card>
        <CardContent className="space-y-3 text-sm">
          {certified ? (
            <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
              Classe certifiée le {dt(status.certifiedAt!)}
              {status.certifiedBy ? ` par ${status.certifiedBy}` : ''}. Ses notes ne se modifient plus.
            </p>
          ) : (
            <>
              {unlocked ? (
                <Alert tone="info">
                  Classe déverrouillée par la direction le {dt(status.unlockedAt!)}
                  {status.unlockReason ? ` — motif : ${status.unlockReason}` : ''}. Vérifiez de nouveau, puis certifiez.
                </Alert>
              ) : null}
              <p className="font-semibold">Avant de certifier la classe</p>
              <ul className="space-y-1">
                <li>
                  {notDone.length === 0 ? '✓' : '✗'} Toutes les matières déclarées « finies » par leur professeur
                  {notDone.length > 0 ? (
                    <span className="block pl-5 text-[color:var(--muted-foreground)]">
                      En attente : {notDone.map((b) => `${b.subject}${b.teacher ? ` (${b.teacher})` : ''}`).join(', ')}
                    </span>
                  ) : null}
                </li>
                <li>
                  {openFlags.length === 0 ? '✓' : '✗'} Tous les signalements réglés
                  {openFlags.length > 0 ? (
                    <span className="block pl-5 text-[color:var(--muted-foreground)]">
                      En attente : {openFlags.map((b) => `${b.student} — ${b.subject}${b.teacher ? ` (${b.teacher})` : ''}`).join(' ; ')}
                    </span>
                  ) : null}
                </li>
              </ul>
              {canAct && notDone.length === 0 && openFlags.length === 0 ? (
                <ConfirmSubmit
                  action={certifyClassAction.bind(null, slug, classId, periodId)}
                  label={`Je certifie avoir vérifié les moyennes de la ${klass.name}`}
                  variant="secondary"
                  confirmMessage={`Certifier les moyennes de la ${klass.name} ? Ensuite, plus personne ne pourra modifier ses notes sans un déverrouillage de la direction.`}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {canAct ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Vérifiez les moyennes avec vos élèves. Si un élève conteste une moyenne, cliquez dessus : elle est signalée au
          professeur de la matière, que l’élève va voir. La case devient{' '}
          <span className="rounded px-1" style={{ backgroundColor: '#f6c453' }}>jaune</span> en attente,{' '}
          <span className="rounded px-1" style={{ backgroundColor: '#9fd9b3' }}>verte</span> si corrigée,{' '}
          <span className="rounded px-1" style={{ backgroundColor: '#b9cdf3' }}>bleue</span> si maintenue.
        </p>
      ) : null}

      <MatrixTable
        matrix={matrix}
        flags={flagMap}
        {...(canAct ? { flagAction: flagGradeAction.bind(null, slug, classId, periodId) } : {})}
      />

      {flags.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Signalements</h2>
          <ul className="divide-y rounded-[--radius-card] border text-sm" style={{ borderColor: 'var(--border)' }}>
            {flags.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <b>{f.student}</b> — {f.subject}
                  <span className="ml-2 text-[color:var(--muted-foreground)]">{FLAG_LABEL[f.status]}</span>
                </span>
                {f.status === 'OPEN' && canAct ? (
                  <SimpleSubmit small action={cancelFlagAction.bind(null, slug, classId, periodId, f.id)} label="Annuler" />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
