import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Harnais de tests RLS.
 *
 * Principe : on n'interroge PAS l'API Supabase, on se connecte directement a
 * Postgres et on simule un utilisateur authentifie exactement comme le fait
 * PostgREST :
 *
 *   set local role authenticated;
 *   set local request.jwt.claims = '{"sub":"<user_id>"}';
 *
 * auth.uid() lit `request.jwt.claims`, donc les policies s'evaluent dans les
 * memes conditions qu'en production, sans dependre du reseau ni d'un jeton.
 *
 * Le role `postgres` possede BYPASSRLS : il sert a poser et a nettoyer les
 * donnees de test. Le role `authenticated` ne l'a pas — c'est lui qui est
 * reellement teste.
 */

const root = join(import.meta.dirname, '..', '..');
for (const file of ['.env.local', '.env']) {
  const path = join(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL manquant : les tests RLS ont besoin d une vraie base.');
}

export type Db = pg.Client;

export async function connect(): Promise<Db> {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    application_name: 'geschool-rls-tests',
  });
  await client.connect();
  return client;
}

/**
 * Execute `fn` sous l'identite d'un utilisateur authentifie.
 *
 * Tout se deroule dans une transaction ANNULEE a la fin : les tests d'ecriture
 * ne laissent aucune trace, et l'ordre d'execution n'a pas d'importance.
 */
export async function asUser<T>(
  db: Db,
  userId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
    return await fn(db);
  } finally {
    await db.query('rollback');
  }
}

/** Lignes visibles par cet utilisateur pour la requete donnee. */
export async function countAs(
  db: Db,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query(`select count(*)::int as n from (${sql}) t`, params);
    return rows[0].n as number;
  });
}

export type WriteOutcome = { allowed: true } | { allowed: false; code: string; message: string };

/**
 * Tente une ecriture. Ne dit PAS si elle a reussi metier, seulement si la RLS
 * l'a laissee passer. La transaction est annulee dans tous les cas.
 */
export async function tryWriteAs(
  db: Db,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<WriteOutcome> {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
    await db.query(sql, params);
    return { allowed: true };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { allowed: false, code: e.code ?? '', message: e.message ?? '' };
  } finally {
    await db.query('rollback');
  }
}

// ---------------------------------------------------------------------------
// Jeu de donnees
// ---------------------------------------------------------------------------

export type SchoolFixture = {
  schoolId: string;
  slug: string;
  yearId: string;
  levelId: string;
  classId: string;
  subjectId: string;
  adminUserId: string;
  teacherUserId: string;
  teacherId: string;
  parentUserId: string;
  guardianId: string;
  /** Enfant rattache au parent */
  childStudentId: string;
  childUserId: string;
  /** Eleve de la meme classe, SANS lien avec le parent */
  otherStudentId: string;
  periodId: string;
  /** Evaluation de l'enseignant, statut CLOSED (donc non publiee) */
  assessmentId: string;
  /** Evaluation PUBLIEE */
  publishedAssessmentId: string;
};

export type Fixture = {
  a: SchoolFixture;
  b: SchoolFixture;
  platformAdminUserId: string;
};

const PREFIX = 'rlstest';

async function createAuthUser(db: Db, email: string): Promise<string> {
  const { rows } = await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1, 'not-a-real-hash', now(), now())
     returning id`,
    [email],
  );
  return rows[0].id as string;
}

async function grantRole(db: Db, membershipId: string, roleCode: string): Promise<void> {
  await db.query(
    `insert into membership_roles (membership_id, role_id)
     select $1, r.id from roles r where r.is_system and r.code = $2`,
    [membershipId, roleCode],
  );
}

async function addMember(db: Db, schoolId: string, userId: string, roleCode: string): Promise<string> {
  const { rows } = await db.query(
    `insert into school_memberships (school_id, user_id, status)
     values ($1, $2, 'ACTIVE') returning id`,
    [schoolId, userId],
  );
  const membershipId = rows[0].id as string;
  await grantRole(db, membershipId, roleCode);
  return membershipId;
}

async function buildSchool(db: Db, tag: string): Promise<SchoolFixture> {
  const slug = `${PREFIX}-${tag}`;

  const school = await db.query(
    `insert into schools (slug, name, status) values ($1, $2, 'ACTIVE') returning id`,
    [slug, `Ecole de test ${tag.toUpperCase()}`],
  );
  const schoolId = school.rows[0].id as string;

  const year = await db.query(
    `insert into academic_years (school_id, name, starts_on, ends_on, status, is_current)
     values ($1, '2026-2027', '2026-09-01', '2027-07-15', 'ACTIVE', true) returning id`,
    [schoolId],
  );
  const yearId = year.rows[0].id as string;

  const cycle = await db.query(
    `insert into cycles (school_id, code, name) values ($1, 'SEC', 'Secondaire') returning id`,
    [schoolId],
  );
  const level = await db.query(
    `insert into levels (school_id, cycle_id, code, name) values ($1, $2, '4E', 'Quatrieme') returning id`,
    [schoolId, cycle.rows[0].id],
  );
  const levelId = level.rows[0].id as string;

  const subject = await db.query(
    `insert into subjects (school_id, code, name) values ($1, 'MATH', 'Mathematiques') returning id`,
    [schoolId],
  );
  const subjectId = subject.rows[0].id as string;

  // Comptes
  const adminUserId = await createAuthUser(db, `${PREFIX}-${tag}-admin@accounts.invalid`);
  const teacherUserId = await createAuthUser(db, `${PREFIX}-${tag}-teacher@accounts.invalid`);
  const parentUserId = await createAuthUser(db, `${PREFIX}-${tag}-parent@accounts.invalid`);
  const childUserId = await createAuthUser(db, `${PREFIX}-${tag}-child@accounts.invalid`);

  await addMember(db, schoolId, adminUserId, 'SCHOOL_ADMIN');
  await addMember(db, schoolId, teacherUserId, 'TEACHER');
  await addMember(db, schoolId, parentUserId, 'PARENT');
  await addMember(db, schoolId, childUserId, 'STUDENT');

  const teacher = await db.query(
    `insert into teachers (school_id, user_id, staff_number, first_name, last_name)
     values ($1, $2, 'ENS-001', 'Prof', 'Test') returning id`,
    [schoolId, teacherUserId],
  );
  const teacherId = teacher.rows[0].id as string;

  const klass = await db.query(
    `insert into classes (school_id, academic_year_id, level_id, code, name, head_teacher_id)
     values ($1, $2, $3, '4E1', '4e 1', $4) returning id`,
    [schoolId, yearId, levelId, teacherId],
  );
  const classId = klass.rows[0].id as string;

  await db.query(
    `insert into teaching_assignments (school_id, academic_year_id, teacher_id, subject_id, class_id, weekly_minutes)
     values ($1, $2, $3, $4, $5, 240)`,
    [schoolId, yearId, teacherId, subjectId, classId],
  );

  // Eleve rattache au parent
  const child = await db.query(
    `insert into students (school_id, user_id, matricule, first_name, last_name)
     values ($1, $2, 'ELV-2026-000001', 'Enfant', 'Lie') returning id`,
    [schoolId, childUserId],
  );
  const childStudentId = child.rows[0].id as string;

  // Eleve de la MEME classe, sans lien avec le parent — c'est lui qui prouve
  // que le perimetre parent est bien restreint
  const other = await db.query(
    `insert into students (school_id, matricule, first_name, last_name)
     values ($1, 'ELV-2026-000002', 'Autre', 'Eleve') returning id`,
    [schoolId],
  );
  const otherStudentId = other.rows[0].id as string;

  for (const sid of [childStudentId, otherStudentId]) {
    await db.query(
      `insert into student_enrollments (school_id, student_id, academic_year_id, class_id)
       values ($1, $2, $3, $4)`,
      [schoolId, sid, yearId, classId],
    );
  }

  const guardian = await db.query(
    `insert into guardians (school_id, user_id, first_name, last_name, phone_e164)
     values ($1, $2, 'Parent', 'Test', $3) returning id`,
    [schoolId, parentUserId, tag === 'a' ? '+2250101010101' : '+2250202020202'],
  );
  const guardianId = guardian.rows[0].id as string;

  await db.query(
    `insert into student_guardians (school_id, student_id, guardian_id, relationship, is_primary_contact)
     values ($1, $2, $3, 'FATHER', true)`,
    [schoolId, childStudentId, guardianId],
  );

  // --- Notation : de quoi tester les perimetres sur les notes ---

  const period = await db.query(
    `insert into academic_periods (school_id, academic_year_id, name, sequence, starts_on, ends_on)
     values ($1, $2, '1er trimestre', 1, '2026-09-01', '2026-12-20') returning id`,
    [schoolId, yearId],
  );
  const periodId = period.rows[0].id as string;

  const scale = await db.query(
    `insert into grading_scales (school_id, code, name, max_score, is_default)
     values ($1, 'SUR20', 'Sur 20', 20, true) returning id`,
    [schoolId],
  );
  const scaleId = scale.rows[0].id as string;

  const atype = await db.query(
    `insert into assessment_types (school_id, code, name) values ($1, 'DEVOIR', 'Devoir') returning id`,
    [schoolId],
  );
  const typeId = atype.rows[0].id as string;

  const mkAssessment = async (title: string, status: string, publishedAt: string | null) => {
    const { rows } = await db.query(
      `insert into assessments (school_id, academic_year_id, academic_period_id, subject_id,
                                class_id, teacher_id, assessment_type_id, title,
                                grading_scale_id, max_score, status, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,20,$10::assessment_status,$11)
       returning id`,
      [schoolId, yearId, periodId, subjectId, classId, teacherId, typeId, title, scaleId, status, publishedAt],
    );
    const id = rows[0].id as string;
    for (const sid of [childStudentId, otherStudentId]) {
      await db.query(
        `insert into grades (school_id, assessment_id, student_id, score) values ($1,$2,$3,14.5)`,
        [schoolId, id, sid],
      );
    }
    return id;
  };

  const assessmentId = await mkAssessment('Devoir non publie', 'CLOSED', null);
  const publishedAssessmentId = await mkAssessment('Devoir publie', 'PUBLISHED', new Date().toISOString());

  return {
    schoolId, slug, yearId, levelId, classId, subjectId,
    adminUserId, teacherUserId, teacherId,
    parentUserId, guardianId,
    childStudentId, childUserId, otherStudentId,
    periodId, assessmentId, publishedAssessmentId,
  };
}

export async function seedFixture(db: Db): Promise<Fixture> {
  await cleanupFixture(db);

  const a = await buildSchool(db, 'a');
  const b = await buildSchool(db, 'b');

  const platformAdminUserId = await createAuthUser(db, `${PREFIX}-platform@accounts.invalid`);
  await db.query(
    `insert into platform_admins (user_id, is_active) values ($1, true)`,
    [platformAdminUserId],
  );

  return { a, b, platformAdminUserId };
}

export async function cleanupFixture(db: Db): Promise<void> {
  // Les cascades depuis schools emportent tout le contenu tenant ;
  // les comptes auth sont supprimes a part.
  await db.query(`delete from schools where slug like $1`, [`${PREFIX}-%`]);
  await db.query(`delete from auth.users where email like $1`, [`${PREFIX}-%`]);
}
