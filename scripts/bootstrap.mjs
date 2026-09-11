#!/usr/bin/env node
/**
 * Amorcage d'un jeu de donnees de demonstration, pour pouvoir se connecter et
 * verifier l'application de bout en bout.
 *
 *   pnpm bootstrap
 *
 * Cree, de facon idempotente :
 *   - un Super Admin plateforme (email reel)
 *   - un etablissement « Lycee Demo » (slug: demo)
 *   - un administrateur d'etablissement (email reel)
 *   - un enseignant, un parent (telephone), un eleve (matricule)
 *   - les comptes, memberships, roles et lignes account_access correspondants
 *
 * Emails et mot de passe pilotes par l'environnement :
 *   PLATFORM_ADMIN_EMAILS   (le premier sert de Super Admin)
 *   DEMO_PASSWORD           (defaut : Demo-Passe-2026)
 *
 * A NE PAS lancer sur une base de production : ces comptes ont des mots de
 * passe connus. Reserve au developpement et a la recette.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Passe-2026';
const PLATFORM_EMAIL =
  (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] ??
  'superadmin@geschool.local';

if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');
  process.exit(1);
}
if ((process.env.NODE_ENV ?? 'development') === 'production') {
  console.error('bootstrap refuse en production (comptes a mot de passe connu).');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

let cachedUsers = null;
async function getOrCreateUser({ email, meta = {}, mustChange = false }) {
  if (!cachedUsers) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    cachedUsers = data.users;
  }
  const existing = cachedUsers.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      app_metadata: { ...existing.app_metadata, must_change_password: mustChange },
    });
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: meta,
    app_metadata: { must_change_password: mustChange },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  cachedUsers.push(data.user);
  return data.user.id;
}

async function roleId(schoolId, code) {
  const { data } = await db.from('roles').select('id').is('school_id', null).eq('code', code).single();
  return data.id;
}

async function ensureMembership(schoolId, userId, roleCode) {
  let { data: m } = await db
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!m) {
    const ins = await db
      .from('school_memberships')
      .insert({ school_id: schoolId, user_id: userId, status: 'ACTIVE' })
      .select('id')
      .single();
    m = ins.data;
  }
  const rid = await roleId(schoolId, roleCode);
  await db.from('membership_roles').upsert(
    { membership_id: m.id, role_id: rid },
    { onConflict: 'membership_id,role_id', ignoreDuplicates: true },
  );
  return m.id;
}

async function ensureAccess(schoolId, userId, kind, identifier, subjectKind, mustChange = false) {
  await db.from('account_access').upsert(
    {
      school_id: schoolId,
      user_id: userId,
      subject_kind: subjectKind,
      login_kind: kind,
      login_identifier: identifier,
      account_status: mustChange ? 'CREATED' : 'ACTIVE',
      activation_status: mustChange ? 'NOT_ACTIVATED' : 'ACTIVATED',
      must_change_password: mustChange,
    },
    { onConflict: 'school_id,user_id' },
  );
}

async function main() {
  console.log('Amorcage en cours...\n');

  // --- Super Admin ----------------------------------------------------------
  const platformId = await getOrCreateUser({
    email: PLATFORM_EMAIL,
    meta: { display_name: 'Super Admin', first_name: 'Super', last_name: 'Admin' },
  });
  await db
    .from('platform_admins')
    .upsert({ user_id: platformId, is_active: true }, { onConflict: 'user_id' });
  console.log(`Super Admin        ${PLATFORM_EMAIL}`);

  // --- Etablissement --------------------------------------------------------
  let { data: school } = await db.from('schools').select('id').eq('slug', 'demo').maybeSingle();
  if (!school) {
    const ins = await db
      .from('schools')
      .insert({
        slug: 'demo',
        name: 'Lycee Demo',
        short_name: 'Demo',
        status: 'ACTIVE',
        country_code: 'CI',
        currency: 'XOF',
        locale: 'fr-CI',
        timezone: 'Africa/Abidjan',
      })
      .select('id')
      .single();
    school = ins.data;
  }
  const schoolId = school.id;

  let { data: year } = await db
    .from('academic_years')
    .select('id')
    .eq('school_id', schoolId)
    .eq('name', '2026-2027')
    .maybeSingle();
  if (!year) {
    const ins = await db
      .from('academic_years')
      .insert({
        school_id: schoolId,
        name: '2026-2027',
        starts_on: '2026-09-01',
        ends_on: '2027-07-15',
        status: 'ACTIVE',
        is_current: true,
      })
      .select('id')
      .single();
    year = ins.data;
  }
  const yearId = year.id;

  const cycle = (
    await db.from('cycles').upsert(
      { school_id: schoolId, code: 'SEC', name: 'Secondaire' },
      { onConflict: 'school_id,code' },
    ).select('id').single()
  ).data;
  const level = (
    await db.from('levels').upsert(
      { school_id: schoolId, cycle_id: cycle.id, code: '4E', name: 'Quatrieme' },
      { onConflict: 'school_id,code' },
    ).select('id').single()
  ).data;
  const subject = (
    await db.from('subjects').upsert(
      { school_id: schoolId, code: 'MATH', name: 'Mathematiques' },
      { onConflict: 'school_id,code' },
    ).select('id').single()
  ).data;
  let { data: klass } = await db
    .from('classes')
    .select('id')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('code', '4E1')
    .maybeSingle();
  if (!klass) {
    klass = (
      await db.from('classes').insert({
        school_id: schoolId, academic_year_id: yearId, level_id: level.id,
        code: '4E1', name: '4e 1', status: 'ACTIVE',
      }).select('id').single()
    ).data;
  }
  console.log('Etablissement      Lycee Demo (/e/demo)');

  // --- Administrateur d'etablissement --------------------------------------
  const adminEmail = 'admin@demo.geschool.local';
  const adminId = await getOrCreateUser({
    email: adminEmail,
    meta: { display_name: 'Awa Directrice', first_name: 'Awa', last_name: 'Directrice' },
  });
  await ensureMembership(schoolId, adminId, 'SCHOOL_ADMIN');
  await ensureAccess(schoolId, adminId, 'EMAIL', adminEmail, 'STAFF');
  console.log(`Administrateur     ${adminEmail}`);

  // --- Enseignant -----------------------------------------------------------
  const teacherEmail = 'prof@demo.geschool.local';
  const teacherUid = await getOrCreateUser({
    email: teacherEmail,
    meta: { display_name: 'Ibrahim Prof', first_name: 'Ibrahim', last_name: 'Prof' },
  });
  await ensureMembership(schoolId, teacherUid, 'TEACHER');
  await ensureAccess(schoolId, teacherUid, 'EMAIL', teacherEmail, 'TEACHER');
  let { data: teacher } = await db
    .from('teachers').select('id').eq('school_id', schoolId).eq('staff_number', 'ENS-001').maybeSingle();
  if (!teacher) {
    teacher = (
      await db.from('teachers').insert({
        school_id: schoolId, user_id: teacherUid, staff_number: 'ENS-001',
        first_name: 'Ibrahim', last_name: 'Prof', status: 'ACTIVE',
      }).select('id').single()
    ).data;
  }
  await db.from('teaching_assignments').upsert(
    { school_id: schoolId, academic_year_id: yearId, teacher_id: teacher.id,
      subject_id: subject.id, class_id: klass.id, weekly_minutes: 240, status: 'ACTIVE' },
    { onConflict: 'academic_year_id,teacher_id,subject_id,class_id,group_id,academic_period_id' },
  );
  console.log(`Enseignant         ${teacherEmail}`);

  // --- Parent (telephone) — premiere connexion imposee ----------------------
  const parentPhone = '+2250101010101';
  const parentEmail = `p.${randomUUID()}@accounts.invalid`;
  let { data: guardian } = await db
    .from('guardians').select('id, user_id').eq('school_id', schoolId).eq('phone_e164', parentPhone).maybeSingle();
  let parentUid;
  if (guardian?.user_id) {
    parentUid = guardian.user_id;
    await getOrCreateUser({ email: parentEmail, mustChange: true }); // no-op si absent
  } else {
    parentUid = await getOrCreateUser({
      email: parentEmail,
      meta: { display_name: 'Kone Parent', first_name: 'Kone', last_name: 'Parent' },
      mustChange: true,
    });
  }
  if (!guardian) {
    guardian = (
      await db.from('guardians').insert({
        school_id: schoolId, user_id: parentUid, first_name: 'Kone', last_name: 'Parent',
        phone_e164: parentPhone, phone_display: '01 01 01 01 01', status: 'ACTIVE',
      }).select('id, user_id').single()
    ).data;
  }
  await ensureMembership(schoolId, parentUid, 'PARENT');
  await ensureAccess(schoolId, parentUid, 'PHONE', parentPhone, 'GUARDIAN', true);
  console.log(`Parent             ${parentPhone}  (premiere connexion imposee)`);

  // --- Eleve (matricule) ----------------------------------------------------
  const matricule = 'ELV-2026-000001';
  const studentEmail = `s.${randomUUID()}@accounts.invalid`;
  let { data: student } = await db
    .from('students').select('id, user_id').eq('school_id', schoolId).eq('matricule', matricule).maybeSingle();
  let studentUid;
  if (student?.user_id) {
    studentUid = student.user_id;
  } else {
    studentUid = await getOrCreateUser({
      email: studentEmail,
      meta: { display_name: 'Ama Eleve', first_name: 'Ama', last_name: 'Eleve' },
    });
  }
  if (!student) {
    student = (
      await db.from('students').insert({
        school_id: schoolId, user_id: studentUid, matricule,
        first_name: 'Ama', last_name: 'Eleve', status: 'ACTIVE',
      }).select('id, user_id').single()
    ).data;
  }
  await db.from('student_enrollments').upsert(
    { school_id: schoolId, student_id: student.id, academic_year_id: yearId, class_id: klass.id, status: 'ENROLLED' },
    { onConflict: 'student_id,academic_year_id' },
  );
  await db.from('student_guardians').upsert(
    { school_id: schoolId, student_id: student.id, guardian_id: guardian.id,
      relationship: 'FATHER', is_primary_contact: true },
    { onConflict: 'student_id,guardian_id' },
  );
  await ensureMembership(schoolId, studentUid, 'STUDENT');
  await ensureAccess(schoolId, studentUid, 'MATRICULE', matricule, 'STUDENT');
  console.log(`Eleve              ${matricule}`);

  console.log(`\nMot de passe commun : ${PASSWORD}`);
  console.log('\nConnexion :');
  console.log('  Personnel / Super Admin -> /login  (email + mot de passe)');
  console.log('  Parents / eleves        -> /e/demo/login  (telephone ou matricule)');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nEchec :', e.message);
    process.exit(1);
  });
