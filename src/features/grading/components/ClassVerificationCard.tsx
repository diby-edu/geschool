import Link from 'next/link';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ClassVerification } from '@/features/grading/head-teacher';
import { unlockClassAction } from '@/features/grading/head-teacher-actions';
import { UnlockClassForm } from './UnlockClassForm';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Pour la direction : la classe a-t-elle été vérifiée par son professeur
 * principal ? Par qui, quand ; sinon ce qui manque (matières non finies,
 * signalements non réglés, avec le nom du professeur). Jamais un blocage :
 * le conseil de classe se tient à la date prévue.
 */
export function ClassVerificationCard({
  ctx,
  slug,
  classId,
  periodId,
  v,
  matrix,
  onCouncil = false,
}: {
  ctx: TenantContext;
  slug: string;
  classId: string;
  periodId: string;
  v: ClassVerification;
  /** Peut tirer la matrice de cette classe. */
  matrix: boolean;
  /** Déjà sur la page du conseil : pas de lien vers elle-même. */
  onCouncil?: boolean;
}) {
  const st = v.status;
  const blockers = v.blockers;
  const name = v.className;
  const head = v.headTeacher;
  const phase = v.phase;
  const certified = st.certifiedAt !== null;
  const notDone = blockers.filter((b) => b.kind === 'NOT_DONE');
  const openFlags = blockers.filter((b) => b.kind === 'OPEN_FLAG');
  const back = `/e/${slug}/bulletins?class=${classId}&period=${periodId}`;

  return (
    <Card>
      <CardContent className="space-y-2 text-sm">
        <p className="font-semibold">
          {certified ? (
            <span style={{ color: 'var(--color-success)' }}>
              🟢 {name} — vérifiée par {st.certifiedBy ?? 'le professeur principal'}, le {when(st.certifiedAt!)}
            </span>
          ) : openFlags.length > 0 ? (
            <span style={{ color: 'var(--color-warning)' }}>🟠 {name} — {openFlags.length} signalement(s) en attente</span>
          ) : (
            <span style={{ color: 'var(--color-danger)' }}>🔴 {name} — pas encore vérifiée par le professeur principal</span>
          )}
        </p>
        {!head ? (
          <p className="text-[color:var(--muted-foreground)]">
            Aucun professeur principal n’est désigné.{' '}
            <Link href={`/e/${slug}/classes/professeurs-principaux`} className="font-medium underline">
              Désigner les professeurs principaux
            </Link>
          </p>
        ) : !certified ? (
          <div className="space-y-1 text-[color:var(--muted-foreground)]">
            <p>Professeur principal : {head}.</p>
            {notDone.length > 0 ? (
              <p>
                Matières pas encore déclarées finies :{' '}
                {notDone.map((b) => `${b.subject}${b.teacher ? ` (${b.teacher})` : ''}`).join(', ')}.
              </p>
            ) : null}
            {openFlags.length > 0 ? (
              <p>
                Signalements non réglés :{' '}
                {openFlags.map((b) => `${b.student} — ${b.subject}${b.teacher ? ` (${b.teacher})` : ''}`).join(' ; ')}.
              </p>
            ) : null}
          </div>
        ) : null}
        {st.unlockedAt && !certified ? (
          <p className="text-[color:var(--muted-foreground)]">
            Déverrouillée le {when(st.unlockedAt)}
            {st.unlockedBy ? ` par ${st.unlockedBy}` : ''} — motif : {st.unlockReason}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {matrix && !onCouncil ? (
            <Link href={`/e/${slug}/matrice?class=${classId}&period=${periodId}&retour=${encodeURIComponent(back)}`}>
              <Button variant="secondary" size="sm">Matrice de la classe</Button>
            </Link>
          ) : null}
          {!onCouncil && (matrix || hasPermission(ctx, 'reports.council_average') || hasPermission(ctx, 'reports.validate')) ? (
            <Link href={`/e/${slug}/conseil?class=${classId}&period=${periodId}`}>
              <Button variant="secondary" size="sm">Conseil de classe</Button>
            </Link>
          ) : null}
          {hasPermission(ctx, 'grades.term_journal') ? (
            <Link href={`/e/${slug}/bulletins/journal?class=${classId}&period=${periodId}`}>
              <Button variant="ghost" size="sm">Journal de fin de trimestre</Button>
            </Link>
          ) : null}
          {hasPermission(ctx, 'grades.unlock_class') && (certified || (phase === 'FROZEN' && !st.unlockedAt)) ? (
            <UnlockClassForm action={unlockClassAction.bind(null, slug, classId, periodId)} className={name} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
