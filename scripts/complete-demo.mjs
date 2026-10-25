#!/usr/bin/env node
/**
 * Complète l'école de démo « Les Cocotiers » pour tester l'application comme
 * un vrai établissement (2026-10-15) :
 *
 *   - un compte existant reçoit le rôle de Directeur (--owner=email) ;
 *   - le personnel : directeur adjoint, censeur, surveillant général,
 *     2 éducateurs, secrétaire, comptable, informaticien (comptes + fiches) ;
 *   - un compte pour CHAQUE enseignant ; 1 sur 5 vacataire, les autres
 *     permanents ; quota 18 h (permanents), 12 h (vacataires) ; taux horaires ;
 *   - un professeur principal par classe (celui qui y a le plus d'heures) ;
 *   - une salle par classe, utilisée par ses cours de l'emploi du temps publié ;
 *   - les appels des cours passés (92 % faits), avec absences et retards ;
 *   - les dates de fin du 1er trimestre ;
 *   - le programme (matières par niveau, coefficients), sans lequel aucune
 *     moyenne générale ne se calcule.
 *
 * Rejouable : ce qui existe déjà n'est ni dupliqué ni écrasé (sauf les
 * réglages, réécrits à l'identique). Ne touche QUE l'école de démo.
 *
 *   node scripts/complete-demo.mjs --owner=moi@exemple.com
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}
if ((process.env.NODE_ENV ?? 'development') === 'production') {
  console.error('complete-demo refuse en production (comptes a mot de passe connu).');
  process.exit(1);
}

const SLUG = 'gs-cocotiers';
const DOMAIN = 'cocotiers.geschool.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Passe-2026';
const owner = process.argv.find((a) => a.startsWith('--owner='))?.slice('--owner='.length) ?? null;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (text, params) => sql.query(text, params).then((r) => r.rows);

// --- comptes ----------------------------------------------------------------
let users = null;
async function allUsers() {
  if (users) return users;
  users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}
async function getOrCreateUser(email, meta) {
  const found = (await allUsers()).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) return found.id;
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: meta, app_metadata: { must_change_password: false },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  users.push(data.user);
  return data.user.id;
}
const roleIds = new Map();
/** La fonction de l'école (sa copie, 0132) ; le modèle commun seulement si l'école n'en a pas. */
async function roleId(schoolId, code) {
  const key = `${schoolId}:${code}`;
  if (!roleIds.has(key)) {
    const [r] = await q(
      'select id from roles where code = $2 and (school_id = $1 or school_id is null) order by school_id nulls last limit 1',
      [schoolId, code],
    );
    if (!r) throw new Error(`rôle ${code} introuvable`);
    roleIds.set(key, r.id);
  }
  return roleIds.get(key);
}
async function ensureMembership(schoolId, userId, roleCode) {
  let [m] = await q('select id from school_memberships where school_id = $1 and user_id = $2', [schoolId, userId]);
  if (!m) [m] = await q("insert into school_memberships (school_id, user_id, status) values ($1, $2, 'ACTIVE') returning id", [schoolId, userId]);
  const rid = await roleId(schoolId, roleCode);
  // Déjà titulaire de cette fonction (copie ou modèle) : rien à ajouter.
  const [has] = await q(
    'select 1 from membership_roles mr join roles r on r.id = mr.role_id where mr.membership_id = $1 and r.code = $2',
    [m.id, roleCode],
  );
  if (!has) await q('insert into membership_roles (membership_id, role_id) values ($1, $2) on conflict do nothing', [m.id, rid]);
}
async function ensureAccess(schoolId, userId, email, subjectKind) {
  await q(
    `insert into account_access (school_id, user_id, subject_kind, login_kind, login_identifier, account_status, activation_status, activated_at, must_change_password)
     values ($1, $2, $3, 'EMAIL', $4, 'ACTIVE', 'ACTIVATED', now(), false)
     on conflict (school_id, user_id) do nothing`,
    [schoolId, userId, subjectKind, email],
  );
}

const FEMALE = new Set(['Awa', 'Aminata', 'Fatoumata', 'Adjoua', 'Aya', 'Affoue', 'Akissi']);

async function main() {
  await sql.connect();
  const [school] = await q('select id, name from schools where slug = $1', [SLUG]);
  if (!school) throw new Error('École de démo introuvable.');
  const [year] = await q("select id from academic_years where school_id = $1 and status = 'ACTIVE'", [school.id]);
  const S = school.id;
  const out = { present: 0, programme: 0, parents: 0, owner: null, staff: [], teachers: 0, vacataires: 0, pp: 0, rooms: 0, registers: 0, records: 0 };

  // 1. Le compte du propriétaire de l'application : Directeur de l'école de démo.
  if (owner) {
    const u = (await allUsers()).find((x) => x.email?.toLowerCase() === owner.toLowerCase());
    if (!u) throw new Error(`Compte ${owner} introuvable.`);
    await ensureMembership(S, u.id, 'DIRECTOR');
    await ensureAccess(S, u.id, owner, 'STAFF');
    out.owner = owner;
  }

  // 2. Le personnel.
  const STAFF = [
    ['directeur.adjoint', 'DEPUTY_DIRECTOR', 'Akissi', "N'GUESSAN", 'F'],
    ['censeur', 'CENSOR', 'Yao', 'KOUAME', 'M'],
    ['surveillant.general', 'HEAD_SUPERVISOR', 'Bakary', 'OUATTARA', 'M'],
    ['educateur.1', 'SUPERVISOR', 'Mariam', 'TOURE', 'F'],
    ['educateur.2', 'SUPERVISOR', 'Serge', 'BROU', 'M'],
    ['secretaire', 'SECRETARY', 'Adjoua', 'KONAN', 'F'],
    ['comptable', 'ACCOUNTANT', 'Ibrahim', 'SANOGO', 'M'],
    ['informaticien', 'IT_ADMIN', 'Junior', 'ACHI', 'M'],
    ['inspecteur', 'EDUCATION_INSPECTOR', 'Rose', 'GBANE', 'F'],
  ];
  let n = 1;
  for (const [local, role, first, last, gender] of STAFF) {
    const email = `${local}@${DOMAIN}`;
    const uid = await getOrCreateUser(email, { display_name: `${first} ${last}`, first_name: first, last_name: last });
    await q('update users set first_name = $2, last_name = $3, display_name = $4 where id = $1', [uid, first, last, `${first} ${last}`]);
    await ensureMembership(S, uid, role);
    await ensureAccess(S, uid, email, 'STAFF');
    const [p] = await q('select id from staff_profiles where school_id = $1 and user_id = $2', [S, uid]);
    if (!p) {
      await q(
        `insert into staff_profiles (school_id, user_id, staff_number, first_name, last_name, gender, email, employment_type, hire_date)
         values ($1, $2, $3, $4, $5, $6, $7, 'PERMANENT', '2020-09-01')`,
        [S, uid, `PER-${String(n).padStart(4, '0')}`, first, last, gender, email],
      );
    }
    n++;
    out.staff.push({ email, role });
  }

  // 3. Les enseignants : un compte chacun, permanents et vacataires.
  const teachers = await q('select id, staff_number, first_name, last_name, user_id from teachers where school_id = $1 and deleted_at is null order by staff_number', [S]);
  let i = 0;
  for (const t of teachers) {
    i++;
    const hourly = i % 5 === 0;
    const gender = FEMALE.has(t.first_name) ? 'F' : 'M';
    let uid = t.user_id;
    if (!uid) {
      const email = `prof.${t.staff_number.toLowerCase()}@${DOMAIN}`;
      uid = await getOrCreateUser(email, { display_name: `${t.first_name} ${t.last_name}`, first_name: t.first_name, last_name: t.last_name });
      await ensureMembership(S, uid, 'TEACHER');
      await ensureAccess(S, uid, email, 'TEACHER');
    }
    await q('update teachers set user_id = $2, employment_type = $3, gender = $4 where id = $1', [t.id, uid, hourly ? 'HOURLY' : 'PERMANENT', gender]);
    if (hourly) out.vacataires++;
    if (i % 25 === 0) console.log(`  ${i} / ${teachers.length} enseignants…`);
  }
  out.teachers = teachers.length;

  // 4. Service et taux (rangés dans les réglages « schedule », fusionnés).
  const [cur] = await q("select settings from school_settings where school_id = $1 and namespace = 'schedule'", [S]);
  const settings = {
    ...(cur?.settings ?? {}),
    teacherServiceDefaults: { PERMANENT: { min: null, max: 18 }, HOURLY: { min: null, max: 12 } },
    payrollRates: { vacationRate: 3000, overtimeRate: 3500 },
  };
  await q(
    `insert into school_settings (school_id, namespace, settings) values ($1, 'schedule', $2)
     on conflict (school_id, namespace) do update set settings = excluded.settings, updated_at = now()`,
    [S, settings],
  );

  // 5. Un professeur principal par classe : celui qui y a le plus d'heures,
  //    jamais principal de deux classes si on peut l'éviter.
  const classes = await q(
    "select c.id, c.name, c.head_teacher_id, c.main_room_id from classes c where c.school_id = $1 and c.academic_year_id = $2 and c.status = 'ACTIVE' order by c.name",
    [S, year.id],
  );
  const ranked = await q(
    `select class_id, teacher_id, sum(weekly_minutes) m from teaching_assignments
     where school_id = $1 and academic_year_id = $2 and status = 'ACTIVE' and class_id is not null
     group by class_id, teacher_id order by class_id, m desc`,
    [S, year.id],
  );
  const taken = new Set(classes.map((c) => c.head_teacher_id).filter(Boolean));
  for (const c of classes) {
    if (c.head_teacher_id) continue;
    const options = ranked.filter((r) => r.class_id === c.id).map((r) => r.teacher_id);
    const pick = options.find((t) => !taken.has(t)) ?? options[0];
    if (!pick) continue;
    taken.add(pick);
    await q('update classes set head_teacher_id = $2 where id = $1', [c.id, pick]);
    out.pp++;
  }

  // 6. Une salle par classe, et les cours de l'emploi du temps publié dans cette salle.
  const rooms = await q('select id from rooms where school_id = $1 and is_active order by code', [S]);
  const usedRooms = new Set(classes.map((c) => c.main_room_id).filter(Boolean));
  const freeRooms = rooms.map((r) => r.id).filter((id) => !usedRooms.has(id));
  for (const c of classes) {
    if (!c.main_room_id && freeRooms.length) {
      c.main_room_id = freeRooms.shift();
      await q('update classes set main_room_id = $2 where id = $1', [c.id, c.main_room_id]);
    }
  }
  const [{ count: roomRows }] = await q(
    `with v as (select id from schedule_versions where school_id = $1 and status = 'PUBLISHED')
     insert into schedule_session_rooms (school_id, session_id, room_id, is_primary)
     select ss.school_id, ss.id, c.main_room_id, true
     from schedule_sessions ss
     join schedule_session_targets t on t.session_id = ss.id and t.class_id is not null
     join classes c on c.id = t.class_id and c.main_room_id is not null
     where ss.schedule_version_id in (select id from v)
       and not exists (select 1 from schedule_session_rooms sr where sr.session_id = ss.id)
     on conflict do nothing
     returning 1`.replace('returning 1', 'returning 1'),
    [S],
  ).then((rows) => [{ count: rows.length }]);
  out.rooms = roomRows;

  // 7. Les appels des cours passés : 92 % faits, par l'enseignant du cours.
  const weeks = await q(
    "select distinct date_trunc('week', occurs_on)::date w from session_occurrences where school_id = $1 and starts_at < now() order by 1",
    [S],
  );
  for (const { w } of weeks) {
    const regs = await q(
      `insert into attendance_registers (school_id, session_occurrence_id, taken_by, taken_at, status, source)
       select o.school_id, o.id, t.user_id, coalesce(o.override_starts_at, o.starts_at) + interval '10 minutes', 'SUBMITTED', 'ONLINE'
       from session_occurrences o
       join lateral (
         select te.user_id from schedule_session_teachers st join teachers te on te.id = st.teacher_id
         where st.session_id = o.schedule_session_id and te.user_id is not null limit 1
       ) t on true
       where o.school_id = $1 and o.status <> 'CANCELLED' and o.starts_at < now()
         and o.occurs_on >= $2::date and o.occurs_on < $2::date + 7
         and (abs(hashtext(o.id::text)) % 100) < 92
         and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id)
       returning id`,
      [S, w],
    );
    out.registers += regs.length;
    // 2 absents et 1 retard par appel (environ 6 % d'absence) ; un absent sur 4 excusé.
    const recs = await q(
      `insert into attendance_records (school_id, register_id, student_id, status, minutes_late, recorded_by, recorded_at, taken_at)
       select r.school_id, r.id, x.student_id,
              (case when x.rn = 3 then 'LATE' when abs(hashtext(x.student_id::text || r.id::text)) % 4 = 0 then 'EXCUSED' else 'ABSENT' end)::attendance_status,
              case when x.rn = 3 then 5 + abs(hashtext(r.id::text)) % 26 else 0 end,
              r.taken_by, r.taken_at, r.taken_at
       from attendance_registers r
       join session_occurrences o on o.id = r.session_occurrence_id
       join schedule_session_targets tg on tg.session_id = o.schedule_session_id and tg.class_id is not null
       cross join lateral (
         select se.student_id, row_number() over (order by hashtext(r.id::text || se.student_id::text)) rn
         from student_enrollments se
         where se.class_id = tg.class_id and se.status = 'ENROLLED'
         order by hashtext(r.id::text || se.student_id::text)
         limit 3
       ) x
       where r.school_id = $1 and o.occurs_on >= $2::date and o.occurs_on < $2::date + 7
         and not exists (select 1 from attendance_records ar where ar.register_id = r.id)
       returning 1`,
      [S, w],
    );
    out.records += recs.length;
    console.log(`  semaine du ${w.toISOString().slice(0, 10)} : ${regs.length} appels, ${recs.length} absences/retards`);
  }

  // Les présents : l'application enregistre TOUS les élèves de l'appel
  // (présent compris), les taux de présence en dépendent. Pour ne pas gonfler
  // la base partagée, seulement sur les 7 derniers jours (la fenêtre du
  // tableau de bord) ; avant, les appels ne gardent que absents et retards.
  const present = await q(
    `insert into attendance_records (school_id, register_id, student_id, status, minutes_late, recorded_by, recorded_at, taken_at)
     select r.school_id, r.id, se.student_id, 'PRESENT', 0, r.taken_by, r.taken_at, r.taken_at
     from attendance_registers r
     join session_occurrences o on o.id = r.session_occurrence_id
     join schedule_session_targets tg on tg.session_id = o.schedule_session_id and tg.class_id is not null
     join student_enrollments se on se.class_id = tg.class_id and se.status = 'ENROLLED'
     where r.school_id = $1 and o.occurs_on > (now() at time zone 'Africa/Abidjan')::date - 7
     on conflict (register_id, student_id) do nothing
     returning 1`,
    [S],
  );
  out.present = present.length;

  // 8. Fin du 1er trimestre (arrêt des notes le 7 déc., vérifications jusqu'au 14 déc.).
  await q(
    `update academic_periods set grades_stop_on = '2026-12-07', student_check_ends_on = '2026-12-10', head_check_ends_on = '2026-12-14'
     where school_id = $1 and academic_year_id = $2 and sequence = 1 and grades_stop_on is null`,
    [S, year.id],
  );

  // Liste des comptes (mot de passe : celui des comptes de démo, DEMO_PASSWORD de scripts/seed-demo.mjs).
  // 8. Le programme (matières de chaque niveau, coefficient, volume) : sans
  // lui, aucune moyenne générale ne se calcule. Tiré des affectations.
  const COEF = { FR: 3, MATH: 3, PHILO: 2, ANG: 2, HG: 2, SVT: 2, PC: 2 };
  const prog = await q(
    `insert into level_subjects (school_id, level_id, subject_id, coefficient, weekly_minutes)
     select $1, c.level_id, ta.subject_id,
            coalesce(($2::jsonb ->> sub.code)::numeric, 1), max(ta.weekly_minutes)
     from teaching_assignments ta
     join classes c on c.id = ta.class_id
     join subjects sub on sub.id = ta.subject_id
     where ta.school_id = $1 and ta.academic_year_id = $3 and ta.status = 'ACTIVE' and c.level_id is not null
     group by c.level_id, ta.subject_id, sub.code
     on conflict (level_id, subject_id) do nothing
     returning id`,
    [S, JSON.stringify(COEF), year.id],
  );
  out.programme = prog.length;

  // Noms d'élèves réalistes : le remplissage initial collait un numéro au nom
  // (« DIARRA1 ») pour les rendre uniques. Le matricule suffit à les distinguer.
  const renamed = await q(
    `update students set last_name = regexp_replace(last_name, '\\d+$', '')
     where school_id = $1 and last_name ~ '\\d+$' returning 1`,
    [S],
  );
  out.renamed = renamed.length;

  // 9. Les parents de démo (un par niveau) : activés avec le mot de passe de
  // démo, pour tester l'espace parent sans passer par le SMS d'activation.
  const parents = await q(
    `select aa.user_id, aa.login_identifier phone, l.name niveau, aa.activation_status
     from account_access aa
     left join lateral (
       select lv.name, lv.sequence from guardians g
       join student_guardians sg on sg.guardian_id = g.id
       join student_enrollments se on se.student_id = sg.student_id and se.status = 'ENROLLED'
       join classes c on c.id = se.class_id join levels lv on lv.id = c.level_id
       where g.school_id = $1 and g.user_id = aa.user_id order by lv.sequence limit 1
     ) l on true
     where aa.school_id = $1 and aa.subject_kind = 'GUARDIAN' order by l.sequence nulls last`,
    [S],
  );
  // Numéros valides (10 chiffres en Côte d'Ivoire) : ceux du premier
  // remplissage en avaient 11, la connexion par téléphone les refusait.
  for (const [i, par] of parents.entries()) {
    const phone = `+22507000000${String(i + 1).padStart(2, '0')}`;
    if (par.phone !== phone) {
      await q('update guardians set phone_e164 = $3 where school_id = $1 and user_id = $2', [S, par.user_id, phone]);
      await q('update account_access set login_identifier = $3 where school_id = $1 and user_id = $2', [S, par.user_id, phone]);
      par.phone = phone;
    }
  }
  // Seulement les parents pas encore activés : changer un mot de passe ferme
  // toutes les sessions ouvertes du compte (un parent connecté serait renvoyé
  // à la page de connexion à chaque passage du script).
  for (const par of parents.filter((x) => x.activation_status !== 'ACTIVATED')) {
    const { error } = await db.auth.admin.updateUserById(par.user_id, { password: PASSWORD, app_metadata: { must_change_password: false } });
    if (error) throw new Error(`parent ${par.phone}: ${error.message}`);
  }
  await q(
    `update account_access set account_status = 'ACTIVE', activation_status = 'ACTIVATED',
       activated_at = coalesce(activated_at, now()), must_change_password = false
     where school_id = $1 and subject_kind = 'GUARDIAN'`,
    [S],
  );
  out.parents = parents.length;

  const pps = await q(
    `select c.name classe, 'prof.' || lower(t.staff_number) || '@${DOMAIN}' email, t.first_name || ' ' || t.last_name nom
     from classes c join teachers t on t.id = c.head_teacher_id where c.school_id = $1 order by c.name limit 12`,
    [S],
  );
  const vac = await q(
    `select 'prof.' || lower(staff_number) || '@${DOMAIN}' email, first_name || ' ' || last_name nom from teachers
     where school_id = $1 and employment_type = 'HOURLY' order by staff_number limit 5`,
    [S],
  );
  const dir = join(root, 'maquettes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'comptes-demo-cocotiers.md'),
    [
      `# Comptes de test — ${school.name}`,
      '',
      'Mot de passe de tous ces comptes : celui des comptes de démo (DEMO_PASSWORD, voir scripts/seed-demo.mjs).',
      'Adresses fictives (.geschool.local) : aucun e-mail ni SMS ne part vers une vraie personne.',
      '',
      '## Direction et personnel',
      `- admin@${DOMAIN} — Fondateur (déjà existant)`,
      ...(out.owner ? [`- ${out.owner} — Directeur (ton propre compte)`] : []),
      ...out.staff.map((s) => `- ${s.email} — ${s.role}`),
      '',
      '## Professeurs principaux (12 premières classes)',
      ...pps.map((p) => `- ${p.classe} : ${p.nom} — ${p.email}`),
      '',
      '## Vacataires (5 premiers)',
      ...vac.map((v) => `- ${v.nom} — ${v.email}`),
      '',
      '## Parents (connexion par numéro de téléphone)',
      ...parents.map((x) => `- ${x.niveau ?? '?'} : ${x.phone}`),
      '',
      `Tous les enseignants : prof.<matricule en minuscules>@${DOMAIN} (ex. prof.ens-1-0001@${DOMAIN}).`,
    ].join('\n') + '\n',
  );

  console.log('\nRésumé :', JSON.stringify({ ...out, staff: out.staff.length }, null, 2));
  await sql.end();
}

main().catch(async (e) => {
  console.error('ÉCHEC :', e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
