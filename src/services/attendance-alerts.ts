import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from './notifications';
import { sendAndLog } from './sms-log';
import type { AlertRecipient, AttendancePolicy } from '@/features/attendance/policy-types';
import { DEFAULT_ATTENDANCE_POLICY } from '@/features/attendance/policy-types';

/**
 * Les alertes d'absence, enfin envoyées.
 *
 * Le réglage existait depuis l'écran ; voici ce qui le lit. Pour chaque école,
 * on compte les heures d'absence de la période en cours, on compare aux deux
 * seuils, et on prévient — une seule fois par franchissement (table 0092).
 *
 * Service : tourne sans utilisateur connecté, donc sans règles d'accès. Toutes
 * les lectures sont explicitement bornées à l'école traitée.
 */

export type AlertRun = {
  schools: number;
  alerts: number;
  summons: number;
  notified: number;
  smsSent: number;
  smsCost: number;
  /** SMS non partis : le quota du mois de l'ecole etait epuise. */
  smsBlocked: number;
};

export async function runAttendanceAlerts(): Promise<AlertRun> {
  const admin = createAdminClient('notifications.send');
  const bilan: AlertRun = { schools: 0, alerts: 0, summons: 0, notified: 0, smsSent: 0, smsCost: 0, smsBlocked: 0 };

  const { data: ecoles } = await admin.from('schools').select('id, name, timezone').eq('status', 'ACTIVE');
  for (const ecole of (ecoles ?? []) as { id: string; name: string }[]) {
    const traite = await traiterEcole(admin, ecole.id);
    if (!traite) continue;
    bilan.schools += 1;
    bilan.alerts += traite.alerts;
    bilan.summons += traite.summons;
    bilan.notified += traite.notified;
    bilan.smsSent += traite.smsSent;
    bilan.smsCost += traite.smsCost;
    bilan.smsBlocked += traite.smsBlocked;
  }
  return bilan;
}

type Compte = { total: number; unjustified: number };

async function traiterEcole(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
): Promise<{
  alerts: number;
  summons: number;
  notified: number;
  smsSent: number;
  smsCost: number;
  smsBlocked: number;
} | null> {
  const policy = await lirePolitique(admin, schoolId);
  if (policy.alertAfterHours <= 0 && policy.summonAfterUnjustifiedHours <= 0) return null;
  if (policy.alertRecipients.length === 0) return null;

  const periode = await periodeEnCours(admin, schoolId);
  if (!periode) return null;

  const absences = await compterAbsences(admin, schoolId, periode);
  if (absences.size === 0) return null;

  // Ce qui a déjà été signalé pour cette période : on ne prévient pas deux fois.
  const { data: deja } = await admin
    .from('attendance_alerts')
    .select('student_id, kind')
    .eq('school_id', schoolId)
    .eq('academic_period_id', periode.id);
  const signale = new Set(((deja ?? []) as { student_id: string; kind: string }[]).map((d) => `${d.student_id}|${d.kind}`));

  let alerts = 0;
  let summons = 0;
  let notified = 0;
  let smsSent = 0;
  let smsBlocked = 0;
  let smsCost = 0;

  for (const [studentId, compte] of absences) {
    for (const kind of ['SUMMONS', 'ALERT'] as const) {
      const seuil = kind === 'ALERT' ? policy.alertAfterHours : policy.summonAfterUnjustifiedHours;
      const heures = kind === 'ALERT' ? compte.total : compte.unjustified;
      if (seuil <= 0 || heures < seuil) continue;
      if (signale.has(`${studentId}|${kind}`)) continue;

      const envoi = await prevenir(admin, schoolId, studentId, kind, heures, seuil, policy);
      const { error } = await admin.from('attendance_alerts').insert({
        school_id: schoolId,
        student_id: studentId,
        academic_period_id: periode.id,
        kind,
        threshold_hours: seuil,
        hours_at_alert: heures,
        recipients: envoi.notified,
        sms_sent: envoi.smsSent,
      });
      // La ligne est posée APRÈS l'envoi : si elle échoue, on préfère un
      // doublon à un silence — une famille prévenue deux fois vaut mieux
      // qu'une famille jamais prévenue.
      if (error) console.error('[alertes] signalement non enregistré :', error.message);

      if (kind === 'ALERT') alerts += 1;
      else summons += 1;
      notified += envoi.notified;
      smsSent += envoi.smsSent;
      smsCost += envoi.cost;
      smsBlocked += envoi.blocked;
    }
  }
  return { alerts, summons, notified, smsSent, smsCost, smsBlocked };
}

/** La période de notation qui couvre aujourd'hui. */
async function periodeEnCours(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
): Promise<{ id: string; name: string; starts_on: string; ends_on: string } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from('academic_periods')
    .select('id, name, starts_on, ends_on, academic_years!inner(is_current)')
    .eq('school_id', schoolId)
    .eq('is_grading_period', true)
    .lte('starts_on', today)
    .gte('ends_on', today)
    .limit(1);
  const row = ((data ?? []) as unknown as { id: string; name: string; starts_on: string; ends_on: string }[])[0];
  return row ?? null;
}

/**
 * Les heures d'absence de chaque élève sur la période.
 *
 * Une heure d'absence = un appel où l'élève n'était pas là. On compte les
 * séances, pas les minutes : c'est ainsi que les établissements comptent, et
 * c'est ce qu'affiche le bulletin.
 *
 * JUSTIFIÉE de deux façons, et il faut les deux :
 *   * l'appel lui-même porte le statut EXCUSED (la vie scolaire savait déjà) ;
 *   * ou une justification APPROUVÉE couvre la date de l'absence (le mot du
 *     parent est arrivé après coup).
 *
 * Ne compter que la première laisserait convoquer une famille qui a pourtant
 * fourni un certificat.
 */
async function compterAbsences(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  periode: { starts_on: string; ends_on: string },
): Promise<Map<string, Compte>> {
  const out = new Map<string, Compte>();
  const taille = 1000;
  let dernier: string | null = null;
  type Ligne = {
    id: string;
    student_id: string;
    status: string;
    attendance_registers: { session_occurrences: { occurs_on: string } | null } | null;
  };
  const absences: { studentId: string; date: string; excused: boolean }[] = [];

  for (;;) {
    let q = admin
      .from('attendance_records')
      .select('id, student_id, status, attendance_registers!inner(session_occurrences!inner(occurs_on))')
      .eq('school_id', schoolId)
      .in('status', ['ABSENT', 'EXCUSED'])
      .gte('attendance_registers.session_occurrences.occurs_on', periode.starts_on)
      .lte('attendance_registers.session_occurrences.occurs_on', periode.ends_on)
      .order('id')
      .limit(taille);
    if (dernier) q = q.gt('id', dernier);

    const { data, error } = await q;
    if (error) {
      console.error('[alertes] lecture des absences impossible :', error.message);
      return out;
    }
    const rows = (data ?? []) as unknown as Ligne[];
    for (const r of rows) {
      const date = r.attendance_registers?.session_occurrences?.occurs_on;
      if (!date) continue;
      absences.push({ studentId: r.student_id, date, excused: r.status === 'EXCUSED' });
    }
    if (rows.length < taille) break;
    dernier = rows[rows.length - 1]!.id;
  }
  if (absences.length === 0) return out;

  // Les justifications approuvées, par élève : des plages de dates.
  const studentIds = [...new Set(absences.map((a) => a.studentId))];
  const couvertures = new Map<string, { from: string; to: string }[]>();
  for (let i = 0; i < studentIds.length; i += 500) {
    const { data } = await admin
      .from('absence_justifications')
      .select('student_id, covers_from, covers_to')
      .eq('school_id', schoolId)
      .eq('status', 'APPROVED')
      .in('student_id', studentIds.slice(i, i + 500));
    for (const j of (data ?? []) as { student_id: string; covers_from: string; covers_to: string }[]) {
      const liste = couvertures.get(j.student_id) ?? [];
      liste.push({ from: j.covers_from, to: j.covers_to });
      couvertures.set(j.student_id, liste);
    }
  }

  for (const a of absences) {
    const c = out.get(a.studentId) ?? { total: 0, unjustified: 0 };
    c.total += 1;
    const couverte =
      a.excused || (couvertures.get(a.studentId) ?? []).some((p) => a.date >= p.from && a.date <= p.to);
    if (!couverte) c.unjustified += 1;
    out.set(a.studentId, c);
  }
  return out;
}

/** Prévenir les destinataires choisis, dans leur tableau de bord et, si demandé, par SMS. */
async function prevenir(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  studentId: string,
  kind: 'ALERT' | 'SUMMONS',
  heures: number,
  seuil: number,
  policy: AttendancePolicy,
): Promise<{ notified: number; smsSent: number; cost: number; blocked: number }> {
  const { data: eleve } = await admin
    .from('students')
    .select('first_name, last_name')
    .eq('id', studentId)
    .maybeSingle();
  const nom = eleve ? `${(eleve as { last_name: string }).last_name.toUpperCase()} ${(eleve as { first_name: string }).first_name}` : 'Un élève';

  const titre =
    kind === 'ALERT' ? `Absences de ${nom}` : `Convocation : absences non justifiées de ${nom}`;
  const corps =
    kind === 'ALERT'
      ? `${heures} h d'absence depuis le début de la période (seuil : ${seuil} h).`
      : `${heures} h d'absence non justifiée depuis le début de la période (seuil : ${seuil} h). Merci de prendre contact avec l'établissement.`;

  const destinataires = await resoudreDestinataires(admin, schoolId, studentId, policy.alertRecipients);
  const notified = await notifyUsers(schoolId, [...destinataires.userIds], {
    type: kind === 'ALERT' ? 'attendance_alert' : 'attendance_summons',
    title: titre,
    body: corps,
    entityType: 'student',
    entityId: studentId,
  });

  let smsSent = 0;
  let cost = 0;
  let blocked = 0;
  if (policy.alertBySms && destinataires.phones.length > 0) {
    const sender = await nomExpediteur(admin, schoolId);
    for (const tel of destinataires.phones) {
      const r = await sendAndLog({
        schoolId,
        to: tel,
        body: `${nom} : ${corps}`,
        sender,
        kind: 'ATTENDANCE',
        pricePerSms: await prixSms(admin),
      });
      if (r.ok) smsSent += 1;
      // Quota epuise : la notification dans le tableau de bord est deja
      // partie, seul le SMS manque. On le compte pour que le bilan le dise.
      if (r.quotaBlocked) blocked += 1;
      cost += r.cost ?? 0;
    }
  }

  return { notified, smsSent, cost, blocked };
}

/** Qui prévenir pour cet élève, selon les destinataires cochés. */
async function resoudreDestinataires(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
  studentId: string,
  recipients: AlertRecipient[],
): Promise<{ userIds: Set<string>; phones: string[] }> {
  const userIds = new Set<string>();
  const phones: string[] = [];

  if (recipients.includes('PARENT')) {
    const { data } = await admin
      .from('student_guardians')
      .select('guardians(user_id, phone_e164)')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('receives_notifications', true);
    for (const l of (data ?? []) as unknown as { guardians: { user_id: string | null; phone_e164: string | null } | null }[]) {
      if (l.guardians?.user_id) userIds.add(l.guardians.user_id);
      if (l.guardians?.phone_e164) phones.push(l.guardians.phone_e164);
    }
  }

  // L'éducateur, le professeur principal et le chef d'établissement se
  // rattachent à la classe de l'élève, pas à l'élève lui-même.
  const codes = recipients.filter((r) => r !== 'PARENT');
  if (codes.length > 0) {
    const { data: inscription } = await admin
      .from('student_enrollments')
      .select('class_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('status', 'ENROLLED')
      .limit(1)
      .maybeSingle();
    const classId = (inscription as { class_id: string } | null)?.class_id;
    if (classId) {
      const { data: classe } = await admin
        .from('classes')
        .select('head_teacher_id, teachers:head_teacher_id(user_id)')
        .eq('id', classId)
        .maybeSingle();
      const c = classe as unknown as { teachers: { user_id: string | null } | null } | null;
      if (codes.includes('HEAD_TEACHER') && c?.teachers?.user_id) userIds.add(c.teachers.user_id);
    }
    if (codes.includes('DIRECTOR') || codes.includes('SUPERVISOR')) {
      const roles = [
        ...(codes.includes('DIRECTOR') ? ['DIRECTOR'] : []),
        ...(codes.includes('SUPERVISOR') ? ['SUPERVISOR', 'HEAD_SUPERVISOR'] : []),
      ];
      const { data } = await admin
        .from('school_memberships')
        .select('user_id, membership_roles(roles(code))')
        .eq('school_id', schoolId)
        .eq('status', 'ACTIVE');
      for (const m of (data ?? []) as unknown as {
        user_id: string;
        membership_roles: { roles: { code: string } | null }[];
      }[]) {
        const mes = m.membership_roles.map((mr) => mr.roles?.code).filter((c2): c2 is string => !!c2);
        if (mes.some((code) => roles.includes(code))) userIds.add(m.user_id);
      }
    }
  }

  return { userIds, phones };
}

async function lirePolitique(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
): Promise<AttendancePolicy> {
  const { data } = await admin
    .from('school_settings')
    .select('settings')
    .eq('school_id', schoolId)
    .eq('namespace', 'attendance')
    .maybeSingle();
  const brut = (data?.settings as Record<string, unknown> | null)?.policy;
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.round(x) : d;
  };
  return {
    alertAfterHours: n(o.alertAfterHours, DEFAULT_ATTENDANCE_POLICY.alertAfterHours),
    alertRecipients: Array.isArray(o.alertRecipients)
      ? (o.alertRecipients as AlertRecipient[])
      : DEFAULT_ATTENDANCE_POLICY.alertRecipients,
    alertBySms: o.alertBySms === true,
    summonAfterUnjustifiedHours: n(
      o.summonAfterUnjustifiedHours,
      DEFAULT_ATTENDANCE_POLICY.summonAfterUnjustifiedHours,
    ),
  };
}

async function nomExpediteur(admin: ReturnType<typeof createAdminClient>, schoolId: string): Promise<string> {
  const { data } = await admin
    .from('school_settings')
    .select('settings')
    .eq('school_id', schoolId)
    .eq('namespace', 'notifications')
    .maybeSingle();
  const s = (data?.settings as Record<string, unknown> | null)?.smsSender as Record<string, unknown> | undefined;
  const nom = typeof s?.name === 'string' ? s.name.trim() : '';
  const approuve = s?.status === 'APPROVED' && s?.usePlatform !== true;
  if (approuve && nom) return nom;
  return await senderPlateforme(admin);
}

async function senderPlateforme(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data } = await admin.from('platform_settings').select('settings').eq('namespace', 'sms').maybeSingle();
  const s = data?.settings as Record<string, unknown> | null;
  return typeof s?.fallbackSender === 'string' && s.fallbackSender ? s.fallbackSender : 'GESCHOOL';
}

async function prixSms(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await admin.from('platform_settings').select('settings').eq('namespace', 'sms').maybeSingle();
  const s = data?.settings as Record<string, unknown> | null;
  const p = Number(s?.pricePerSms);
  return Number.isFinite(p) ? p : 15;
}
