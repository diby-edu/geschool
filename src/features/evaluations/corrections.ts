import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable, hasPermission } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { notifyUsers } from '@/services/notifications';
import type { CorrectionRow, CorrectionStatus } from './correction-types';

/**
 * Corriger une note après clôture, sans pouvoir le faire en cachette.
 *
 * Voir la migration 0086 pour la règle : on demande, l'enseignant répond, et
 * seule la direction peut passer outre — en laissant la mention dans le
 * journal. Ici, on ne fait qu'ouvrir la demande et lire le journal : la
 * décision elle-même passe par une fonction en base, pour que la note et le
 * journal ne puissent jamais diverger.
 */

export type NewCorrection = {
  gradeId: string;
  newScore: number | null;
  newIsAbsent: boolean;
  reason: string;
};

export async function requestCorrection(ctx: TenantContext, input: NewCorrection): Promise<void> {
  requireWritable(ctx, 'grades.request_change');
  const supabase = await createClient();

  const { data } = await supabase
    .from('grades')
    .select('id, score, is_absent, student_id, assessment_id, assessments(teacher_id, status, title)')
    .eq('school_id', ctx.school.id)
    .eq('id', input.gradeId)
    .maybeSingle();
  if (!data) throw new NotFoundError('Note introuvable.');

  const grade = data as unknown as {
    id: string;
    score: number | null;
    is_absent: boolean;
    student_id: string;
    assessment_id: string;
    assessments: { teacher_id: string | null; status: string; title: string } | null;
  };
  const a = grade.assessments;

  // Avant la clôture, l'enseignant modifie librement ses notes : passer par une
  // demande n'aurait aucun sens, et ferait croire à un contrôle inexistant.
  if (a && a.status === 'DRAFT') {
    throw new ValidationError(
      'Cette évaluation n’est pas encore clôturée : l’enseignant peut corriger la note lui-même.',
    );
  }

  const reason = input.reason.trim();
  if (reason.length < 5) throw new ValidationError('Indiquez le motif de la correction : il figurera au journal.');

  const meme =
    Number(grade.score) === input.newScore && grade.is_absent === input.newIsAbsent;
  if (meme) throw new ValidationError('La valeur demandée est identique à la note actuelle.');

  const { error } = await supabase.from('grade_change_requests').insert({
    school_id: ctx.school.id,
    grade_id: grade.id,
    assessment_id: grade.assessment_id,
    student_id: grade.student_id,
    teacher_id: a?.teacher_id ?? null,
    old_score: grade.score,
    old_is_absent: grade.is_absent,
    new_score: input.newScore,
    new_is_absent: input.newIsAbsent,
    reason,
    requested_by: ctx.user.id,
  });
  // Une demande est déjà ouverte sur cette note : le dire, plutôt qu'un code
  // d'erreur de base de données.
  if (error) {
    if (error.code === '23505') {
      throw new ValidationError('Une demande de correction est déjà en attente sur cette note.');
    }
    throw error;
  }

  // Prévenir l'enseignant : sans cela, la demande dormirait dans un écran
  // qu'il n'a aucune raison d'ouvrir.
  if (a?.teacher_id) {
    const { data: t } = await supabase
      .from('teachers')
      .select('user_id, first_name')
      .eq('school_id', ctx.school.id)
      .eq('id', a.teacher_id)
      .maybeSingle();
    if (t?.user_id) {
      await notifyUsers(ctx.school.id, [t.user_id], {
        type: 'grade_change_requested',
        title: 'Une correction de note vous est demandée',
        body: `${a.title} — note actuelle ${format(grade.score, grade.is_absent)}, correction demandée ${format(input.newScore, input.newIsAbsent)}. Motif : ${reason}`,
        entityType: 'grade',
        entityId: grade.id,
      });
    }
  }

  await audit(ctx, {
    action: 'grades.request_change',
    module: 'grades',
    entityType: 'grade',
    entityId: grade.id,
    after: { newScore: input.newScore, reason },
  });
}

/** Accepter, refuser, ou passer outre. La base décide de ce qui est permis. */
export async function decideCorrection(
  ctx: TenantContext,
  requestId: string,
  accept: boolean,
  reason?: string,
): Promise<CorrectionStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('decide_grade_change' as never, {
    p_request: requestId,
    p_accept: accept,
    p_reason: reason ?? null,
  } as never);
  if (error) throw new ValidationError(error.message);

  const status = data as unknown as CorrectionStatus;

  // Qui prévenir : l'enseignant quand on est passé outre — il doit l'apprendre
  // de l'application, pas du bulletin — et le demandeur dans tous les cas.
  const { data: d } = await supabase
    .from('grade_change_requests')
    .select('requested_by, teacher_id, teachers(user_id), assessments(title)')
    .eq('school_id', ctx.school.id)
    .eq('id', requestId)
    .maybeSingle();
  const info = d as unknown as {
    requested_by: string;
    teachers: { user_id: string | null } | null;
    assessments: { title: string } | null;
  } | null;

  if (info) {
    const titre = info.assessments?.title ?? 'une évaluation';
    if (status === 'APPLIED_WITHOUT_CONSENT' && info.teachers?.user_id) {
      await notifyUsers(ctx.school.id, [info.teachers.user_id], {
        type: 'grade_change_forced',
        title: 'Une note a été corrigée sans votre accord',
        body: `${titre} — la direction a appliqué la correction. ${reason ? `Motif : ${reason}` : ''}`.trim(),
        entityType: 'grade_change_request',
        entityId: requestId,
      });
    }
    if (info.requested_by !== ctx.user.id) {
      await notifyUsers(ctx.school.id, [info.requested_by], {
        type: 'grade_change_decided',
        title:
          status === 'ACCEPTED'
            ? 'Votre demande de correction a été acceptée'
            : 'Votre demande de correction a été refusée',
        body: `${titre}. ${reason ? `Motif : ${reason}` : ''}`.trim(),
        entityType: 'grade_change_request',
        entityId: requestId,
      });
    }
  }

  await audit(ctx, {
    action: `grades.change_${status.toLowerCase()}`,
    module: 'grades',
    entityType: 'grade_change_request',
    entityId: requestId,
    after: { status, reason: reason ?? null },
  });
  return status;
}

export type CorrectionFilter = {
  /** Seulement celles que l'utilisateur doit traiter lui-même. */
  mine?: boolean;
  status?: CorrectionStatus | 'ALL';
};

export async function listCorrections(ctx: TenantContext, filter: CorrectionFilter = {}): Promise<CorrectionRow[]> {
  const supabase = await createClient();

  type Row = {
    id: string;
    status: CorrectionStatus;
    old_score: number | null;
    old_is_absent: boolean;
    new_score: number | null;
    new_is_absent: boolean;
    reason: string;
    decision_reason: string | null;
    requested_at: string;
    decided_at: string | null;
    teacher_id: string | null;
    students: { first_name: string; last_name: string; matricule: string } | null;
    assessments: { title: string; subjects: { name: string } | null; classes: { name: string } | null } | null;
    teachers: { first_name: string; last_name: string; user_id: string | null } | null;
  };

  const rows = await fetchAllRows<Row & { id: string }>((cursor) => {
    let q = supabase
      .from('grade_change_requests')
      .select(
        'id, status, old_score, old_is_absent, new_score, new_is_absent, reason, decision_reason, requested_at, decided_at, teacher_id, ' +
          'students(first_name, last_name, matricule), ' +
          'assessments(title, subjects(name), classes(name)), ' +
          'teachers(first_name, last_name, user_id)',
      )
      .eq('school_id', ctx.school.id)
      .order('id')
      .limit(300);
    if (filter.status && filter.status !== 'ALL') q = q.eq('status', filter.status);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: (Row & { id: string })[] | null; error: { message: string } | null }>;
  }, 300);

  return rows
    .map((r) => ({
      id: r.id,
      status: r.status,
      student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
      matricule: r.students?.matricule ?? '',
      subject: r.assessments?.subjects?.name ?? '—',
      klass: r.assessments?.classes?.name ?? '—',
      assessment: r.assessments?.title ?? '—',
      teacher: r.teachers ? `${r.teachers.last_name.toUpperCase()} ${r.teachers.first_name}` : '—',
      teacherId: r.teacher_id,
      teacherHasAccount: !!r.teachers?.user_id,
      before: valeur(r.old_score, r.old_is_absent),
      after: valeur(r.new_score, r.new_is_absent),
      reason: r.reason,
      decisionReason: r.decision_reason,
      requestedAt: r.requested_at,
      decidedAt: r.decided_at,
      /** L'utilisateur est-il l'enseignant à qui on demande ? */
      isMine: false,
    }))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/** Celles que l'enseignant connecté doit traiter. */
export async function listMyPendingCorrections(ctx: TenantContext): Promise<CorrectionRow[]> {
  const supabase = await createClient();
  const { data: me } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!me) return [];
  // L'administration voit aussi les demandes en attente des autres : on ne
  // garde que celles qui s'adressent à CET enseignant, sinon l'écran lui
  // proposerait de répondre à la place d'un collègue.
  return (await listCorrections(ctx, { status: 'PENDING' }))
    .filter((c) => c.teacherId === me.id)
    .map((c) => ({ ...c, isMine: true }));
}

export function canOverride(ctx: TenantContext): boolean {
  return hasPermission(ctx, 'grades.override');
}

const format = (score: number | null, absent: boolean) => valeur(score, absent);

function valeur(score: number | null, absent: boolean): string {
  if (absent) return 'Absent';
  return score === null ? '—' : Number(score).toFixed(2).replace('.', ',');
}
