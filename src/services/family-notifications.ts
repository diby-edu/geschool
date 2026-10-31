import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyEach } from './notifications';

/**
 * Ce que les familles reçoivent (0171) : une notification par heure d'absence,
 * par note publiée, par bulletin publié — dans l'application et sur le
 * téléphone, jamais par SMS.
 *
 * Destinataires : les tuteurs de l'élève qui ont un compte et qui reçoivent les
 * notifications (student_guardians.receives_notifications), et seulement pour
 * les enfants dont l'Espace Parent est payé (0172).
 *
 * Jamais bloquant : appelé après coup, une erreur ici ne défait rien.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Parmi ces élèves, ceux dont l'Espace Parent est payé (0172) ; tous avant la migration. */
async function unlocked(admin: Admin, schoolId: string, studentIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < studentIds.length; i += 500) {
    const part = studentIds.slice(i, i + 500);
    const { data, error } = await admin.rpc('students_unlocked' as never, { p_school: schoolId, p_students: part } as never);
    if (error) return studentIds;
    out.push(...((data ?? []) as unknown as (string | { students_unlocked: string })[]).map((r) => (typeof r === 'string' ? r : r.students_unlocked)));
  }
  return out;
}

/**
 * Les tuteurs à prévenir, élève par élève — seulement pour les enfants dont
 * l'Espace Parent est payé : rien n'est gratuit, pas même une notification.
 */
async function guardiansOf(admin: Admin, schoolId: string, all: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const studentIds = await unlocked(admin, schoolId, all);
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await admin
      .from('student_guardians')
      .select('student_id, guardians!inner(user_id)')
      .eq('school_id', schoolId)
      .eq('receives_notifications', true)
      .in('student_id', studentIds.slice(i, i + 200))
      .not('guardians.user_id', 'is', null);
    for (const l of (data ?? []) as unknown as { student_id: string; guardians: { user_id: string | null } | null }[]) {
      if (l.guardians?.user_id) out.set(l.student_id, [...(out.get(l.student_id) ?? []), l.guardians.user_id]);
    }
  }
  return out;
}

async function names(admin: Admin, studentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await admin.from('students').select('id, first_name, last_name').in('id', studentIds.slice(i, i + 200));
    for (const s of (data ?? []) as { id: string; first_name: string; last_name: string }[]) out.set(s.id, `${s.last_name.toUpperCase()} ${s.first_name}`);
  }
  return out;
}

/** Absence à une heure de cours : « KONE Aya — absence en Mathématiques, sam. 31/10, 15 h 10 – 16 h 10 (1 h). » */
export async function notifyAbsences(schoolId: string, studentIds: string[], course: { subject: string; dayLabel: string; span: string; occurrenceId: string }): Promise<void> {
  if (studentIds.length === 0) return;
  try {
    const admin = createAdminClient('notifications.send');
    const [tuteurs, noms] = await Promise.all([guardiansOf(admin, schoolId, studentIds), names(admin, studentIds)]);
    await notifyEach(
      schoolId,
      studentIds.map((id) => ({
        userIds: tuteurs.get(id) ?? [],
        input: {
          type: 'attendance.absent',
          title: `Absence — ${noms.get(id) ?? 'votre enfant'}`,
          body: `Absent(e) en ${course.subject}, ${course.dayLabel}, ${course.span} (1 h).`,
          entityType: 'session_occurrence',
          entityId: course.occurrenceId,
          data: { studentId: id },
          href: `/mes-absences?enfant=${id}`,
        },
      })),
    );
  } catch (error) {
    console.error('[familles] absences non notifiées', error);
  }
}

/** Notes publiées : une notification par note, aux tuteurs de chaque élève noté. */
export async function notifyGradesPublished(schoolId: string, assessmentIds: string[]): Promise<void> {
  if (assessmentIds.length === 0) return;
  try {
    const admin = createAdminClient('notifications.send');
    for (let i = 0; i < assessmentIds.length; i += 50) {
      const ids = assessmentIds.slice(i, i + 50);
      const { data: evals } = await admin.from('assessments').select('id, title, max_score, subjects(name)').in('id', ids).eq('school_id', schoolId);
      const byId = new Map(
        ((evals ?? []) as unknown as { id: string; title: string; max_score: number | null; subjects: { name: string } | null }[]).map((a) => [a.id, a]),
      );
      const { data: notes } = await admin
        .from('grades')
        .select('assessment_id, student_id, score, is_absent')
        .eq('school_id', schoolId)
        .in('assessment_id', ids);
      const rows = (notes ?? []) as { assessment_id: string; student_id: string; score: number | null; is_absent: boolean }[];
      const students = [...new Set(rows.map((r) => r.student_id))];
      const tuteurs = await guardiansOf(admin, schoolId, students);
      await notifyEach(
        schoolId,
        rows
          .filter((r) => r.score !== null || r.is_absent)
          .map((r) => {
            const a = byId.get(r.assessment_id);
            const note = r.is_absent ? 'absent(e)' : `${Number(r.score).toLocaleString('fr-FR')}/${Number(a?.max_score ?? 20).toLocaleString('fr-FR')}`;
            return {
              userIds: tuteurs.get(r.student_id) ?? [],
              input: {
                type: 'grades.new',
                title: `Nouvelle note — ${a?.subjects?.name ?? 'Matière'}`,
                body: `${a?.title ?? 'Évaluation'} : ${note}.`,
                entityType: 'assessment',
                entityId: r.assessment_id,
                data: { studentId: r.student_id },
                href: `/mes-notes?enfant=${r.student_id}`,
              },
            };
          }),
      );
    }
  } catch (error) {
    console.error('[familles] notes non notifiées', error);
  }
}

/** Bulletins publiés d'une classe pour une période. */
export async function notifyBulletinsPublished(schoolId: string, classId: string, periodId: string): Promise<void> {
  try {
    const admin = createAdminClient('notifications.send');
    const [{ data: cards }, { data: period }] = await Promise.all([
      admin.from('report_cards').select('student_id').eq('school_id', schoolId).eq('class_id', classId).eq('academic_period_id', periodId).eq('status', 'PUBLISHED'),
      admin.from('academic_periods').select('name').eq('id', periodId).maybeSingle(),
    ]);
    const students = ((cards ?? []) as { student_id: string }[]).map((c) => c.student_id);
    const [tuteurs, noms] = await Promise.all([guardiansOf(admin, schoolId, students), names(admin, students)]);
    await notifyEach(
      schoolId,
      students.map((id) => ({
        userIds: tuteurs.get(id) ?? [],
        input: {
          type: 'reports.published',
          title: 'Bulletin disponible',
          body: `${noms.get(id) ?? 'Votre enfant'} — bulletin ${period?.name ? `du ${period.name}` : 'du trimestre'}.`,
          entityType: 'report_card',
          data: { studentId: id },
          href: '/mes-bulletins',
        },
      })),
    );
  } catch (error) {
    console.error('[familles] bulletins non notifiés', error);
  }
}

/**
 * Annonces : un parent qui n'a aucun enfant payé ne les reçoit pas (0172). On
 * renvoie, parmi ces comptes, ceux à écarter : parents seulement (sans autre
 * fonction dans l'école) et sans aucun enfant débloqué.
 */
export async function parentsWithoutAccess(schoolId: string, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (userIds.length === 0) return out;
  try {
    const admin = createAdminClient('notifications.send');
    const links: { user_id: string; student_id: string }[] = [];
    for (let i = 0; i < userIds.length; i += 200) {
      const { data } = await admin
        .from('student_guardians')
        .select('student_id, guardians!inner(user_id)')
        .eq('school_id', schoolId)
        .in('guardians.user_id', userIds.slice(i, i + 200));
      for (const l of (data ?? []) as unknown as { student_id: string; guardians: { user_id: string | null } | null }[]) {
        if (l.guardians?.user_id) links.push({ user_id: l.guardians.user_id, student_id: l.student_id });
      }
    }
    if (links.length === 0) return out;
    const open = new Set(await unlocked(admin, schoolId, [...new Set(links.map((l) => l.student_id))]));
    const parents = new Set(links.map((l) => l.user_id));
    const withAccess = new Set(links.filter((l) => open.has(l.student_id)).map((l) => l.user_id));
    // Ceux qui ont aussi une fonction dans l'école (enseignant, personnel) restent destinataires.
    const { data: roles } = await admin
      .from('school_memberships')
      .select('user_id, membership_roles(roles(code))')
      .eq('school_id', schoolId)
      .in('user_id', [...parents]);
    for (const m of (roles ?? []) as unknown as { user_id: string; membership_roles: { roles: { code: string } | null }[] }[]) {
      const onlyParent = m.membership_roles.every((r) => !r.roles || r.roles.code === 'PARENT');
      if (onlyParent && !withAccess.has(m.user_id)) out.add(m.user_id);
    }
  } catch (error) {
    console.error('[familles] tri des annonces impossible', error);
  }
  return out;
}
