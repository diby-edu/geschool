#!/usr/bin/env node
/**
 * Jeu de donnees de demonstration : 3 etablissements complets pour tester
 * l'application de bout en bout (structure, effectifs, emplois du temps,
 * notes), a des stades d'annee differents.
 *
 *   pnpm seed:demo -- --reset          (supprime l'ancien etablissement demo)
 *   pnpm seed:demo -- --school=1       (ecole 1 seule, grande echelle)
 *   pnpm seed:demo -- --school=2
 *   pnpm seed:demo -- --school=3
 *   pnpm seed:demo -- --all            (reset + les 3, dans l'ordre)
 *   pnpm seed:demo -- --grades=1       (notes seules, ecole deja construite)
 *   pnpm seed:demo -- --grades=2
 *
 * Ne cree PAS les emplois du temps (fait via l'application reelle, solveur
 * compris — voir scripts/README-seed.md) ni les identifiants pilotes par
 * l'application (Server Actions) : ecrit directement en base avec la cle de
 * service, comme scripts/bootstrap.mjs. Les notes (--grades) sont
 * independantes de l'emploi du temps genere.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Passe-2026';
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');
  process.exit(1);
}
if ((process.env.NODE_ENV ?? 'development') === 'production') {
  console.error('seed-demo refuse en production (comptes a mot de passe connu).');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f) => { const p = args.find((a) => a.startsWith(`${f}=`)); return p ? p.slice(f.length + 1) : null; };

// ---------------------------------------------------------------------------
// Utilitaires generiques
// ---------------------------------------------------------------------------

async function chunkedInsert(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await db.from(table).insert(slice);
    if (error) throw new Error(`insert ${table} [${i}..${i + slice.length}]: ${error.message}`);
  }
}

async function chunkedInsertReturning(table, rows, size = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { data, error } = await db.from(table).insert(slice).select('id');
    if (error) throw new Error(`insert ${table} [${i}..${i + slice.length}]: ${error.message}`);
    out.push(...data.map((d) => d.id));
  }
  return out;
}

/**
 * PostgREST plafonne chaque reponse a 1000 lignes, quel que soit le nombre de
 * lignes reellement en base — decouvert quand un fetch non pagine de
 * student_enrollments (4000 lignes pour l'Ecole 1) n'en rendait que 1000,
 * faisant sauter silencieusement 3/4 des classes lors du peuplement des
 * notes. La cle de service ne fait pas exception (le plafond n'est pas lie a
 * la RLS). `.range()` par decalage est sans risque ici (pas de RLS a
 * reevaluer par ligne sautee, cf. src/lib/supabase/pagination.ts cote appli
 * pour le cas RLS).
 */
async function fetchAllRows(table, select, applyFilters) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await applyFilters(db.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch ${table} [${from}..${from + PAGE - 1}]: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

let userCache = null;
async function getOrCreateUser({ email, meta = {}, mustChange = false }) {
  if (!userCache) {
    const all = [];
    let page = 1;
    for (;;) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      all.push(...data.users);
      if (data.users.length < 1000) break;
      page++;
    }
    userCache = all;
  }
  const existing = userCache.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password: PASSWORD, app_metadata: { ...existing.app_metadata, must_change_password: mustChange } });
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: meta, app_metadata: { must_change_password: mustChange },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  userCache.push(data.user);
  return data.user.id;
}

async function roleId(code) {
  const { data, error } = await db.from('roles').select('id').is('school_id', null).eq('code', code).single();
  if (error) throw new Error(`role ${code}: ${error.message}`);
  return data.id;
}
const roleIdCache = new Map();
async function cachedRoleId(code) {
  if (!roleIdCache.has(code)) roleIdCache.set(code, await roleId(code));
  return roleIdCache.get(code);
}

async function ensureMembership(schoolId, userId, roleCode) {
  let { data: m } = await db.from('school_memberships').select('id').eq('school_id', schoolId).eq('user_id', userId).maybeSingle();
  if (!m) {
    const ins = await db.from('school_memberships').insert({ school_id: schoolId, user_id: userId, status: 'ACTIVE' }).select('id').single();
    m = ins.data;
  }
  const rid = await cachedRoleId(roleCode);
  await db.from('membership_roles').upsert({ membership_id: m.id, role_id: rid }, { onConflict: 'membership_id,role_id', ignoreDuplicates: true });
  return m.id;
}

async function ensureAccess(schoolId, userId, kind, identifier, subjectKind, mustChange = false) {
  // Contrainte account_access_activation_consistency (migration 0007) : un
  // compte ACTIVATED exige activated_at non nul. L'oublier ne leve PAS d'echec
  // visible sans verifier `error` — d'ou la verification stricte ci-dessous.
  const { error } = await db.from('account_access').upsert(
    { school_id: schoolId, user_id: userId, subject_kind: subjectKind, login_kind: kind, login_identifier: identifier,
      account_status: mustChange ? 'CREATED' : 'ACTIVE', activation_status: mustChange ? 'NOT_ACTIVATED' : 'ACTIVATED',
      activated_at: mustChange ? null : new Date().toISOString(), must_change_password: mustChange },
    { onConflict: 'school_id,user_id' },
  );
  if (error) throw new Error(`account_access ${identifier}: ${error.message}`);
}

function e164(schoolIndex, n) {
  // Numeros fictifs, jamais de vrais numeros ivoiriens : prefixe 090 (non attribue), suivi d'un compteur unique par ecole.
  return `+2250900${schoolIndex}${String(n).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Referentiels communs (matieres, cycles/niveaux/classes, salles)
// ---------------------------------------------------------------------------

const SUBJECTS = [
  { code: 'FR', name: 'Français', hours: 4 },
  { code: 'MATH', name: 'Mathématiques', hours: 4 },
  { code: 'ANG', name: 'Anglais', hours: 3 },
  { code: 'ESP', name: 'Espagnol', hours: 2 },
  { code: 'HG', name: 'Histoire-Géographie', hours: 3 },
  { code: 'SVT', name: 'SVT', hours: 2 },
  { code: 'PC', name: 'Physique-Chimie', hours: 2 },
  { code: 'EPS', name: 'EPS', hours: 2 },
  { code: 'EDHC', name: 'EDHC', hours: 1 },
  { code: 'ARTS', name: 'Arts Plastiques', hours: 1 },
  { code: 'INFO', name: 'Informatique', hours: 1 },
  { code: 'PHILO', name: 'Philosophie', hours: 3, onlyLevels: ['1ERE', 'TERM'] },
];

const COLLEGE_LEVELS = [
  { code: '6E', name: '6ème', sequence: 1 },
  { code: '5E', name: '5ème', sequence: 2 },
  { code: '4E', name: '4ème', sequence: 3 },
  { code: '3E', name: '3ème', sequence: 4 },
];
const LYCEE_LEVELS = [
  { code: '2NDE', name: '2nde', sequence: 5, sections: ['A', 'C'] },
  { code: '1ERE', name: '1ère', sequence: 6, sections: ['A', 'C', 'D'] },
  { code: 'TERM', name: 'Terminale', sequence: 7, sections: ['A', 'C', 'D'] },
];

/** Plan de classes d'un etablissement. `scale` = 'large' (Ecole 1) | 'small' (Ecoles 2/3). */
function buildClassPlan(scale) {
  const classes = [];
  const collegeCounts = scale === 'large' ? { '6E': 10, '5E': 13, '4E': 11, '3E': 12 } : { '6E': 2, '5E': 2, '4E': 2, '3E': 2 };
  for (const lvl of COLLEGE_LEVELS) {
    const n = collegeCounts[lvl.code];
    for (let i = 1; i <= n; i++) {
      classes.push({ levelCode: lvl.code, levelName: lvl.name, cycle: 'COLLEGE', code: `${lvl.code}-${i}`, name: `${lvl.name} ${i}` });
    }
  }
  for (const lvl of LYCEE_LEVELS) {
    const perSection = scale === 'large' ? (lvl.code === '2NDE' ? 5 : 4) : 1;
    for (const sec of lvl.sections) {
      for (let i = 1; i <= perSection; i++) {
        const suffix = scale === 'large' ? `${sec}${i}` : sec;
        classes.push({ levelCode: lvl.code, levelName: lvl.name, cycle: 'LYCEE', code: `${lvl.code}-${suffix}`, name: `${lvl.name} ${suffix}` });
      }
    }
  }
  return classes;
}

function subjectAppliesTo(subject, levelCode) {
  if (!subject.onlyLevels) return true;
  return subject.onlyLevels.includes(levelCode);
}

const PERIODS_SPEC = [
  { name: 'Trimestre 1', sequence: 1, starts_on: '2026-09-02', ends_on: '2026-12-18' },
  { name: 'Trimestre 2', sequence: 2, starts_on: '2027-01-05', ends_on: '2027-03-26' },
  { name: 'Trimestre 3', sequence: 3, starts_on: '2027-04-06', ends_on: '2027-06-30' },
];

// ---------------------------------------------------------------------------
// Suppression de l'ancien etablissement de demonstration
// ---------------------------------------------------------------------------

async function resetSchool(slug) {
  const { data: school } = await db.from('schools').select('id, name').eq('slug', slug).maybeSingle();
  if (!school) { console.log(`(rien a supprimer pour "${slug}")`); return; }

  const { data: memberships } = await db.from('school_memberships').select('user_id').eq('school_id', school.id);
  const userIds = Array.from(new Set((memberships ?? []).map((m) => m.user_id)));

  const { error } = await db.from('schools').delete().eq('id', school.id);
  if (error) throw new Error(`suppression ecole ${slug}: ${error.message}`);
  console.log(`Ecole "${school.name}" (/e/${slug}) supprimee (cascade sur classes/eleves/profs/...).`);

  for (const uid of userIds) {
    // Le compte plateforme (Super Admin) n'est jamais membre d'une ecole : rien a proteger ici.
    const { error: delErr } = await db.auth.admin.deleteUser(uid);
    if (delErr) console.warn(`  (compte ${uid} non supprime : ${delErr.message})`);
  }
  console.log(`${userIds.length} compte(s) auth supprime(s).`);
}

// ---------------------------------------------------------------------------
// Construction d'un etablissement
// ---------------------------------------------------------------------------

async function buildSchool(spec) {
  const { slug, name, scale, credentials } = spec;
  console.log(`\n=== ${name} (/e/${slug}) — echelle ${scale} ===`);

  // --- ecole + annee ---
  let { data: school } = await db.from('schools').select('id').eq('slug', slug).maybeSingle();
  if (!school) {
    const ins = await db.from('schools').insert({
      slug, name, short_name: name.split(' ').slice(-1)[0], status: 'ACTIVE',
      country_code: 'CI', currency: 'XOF', locale: 'fr-CI', timezone: 'Africa/Abidjan',
    }).select('id').single();
    if (ins.error) throw new Error(`school ${slug}: ${ins.error.message}`);
    school = ins.data;
  }
  const schoolId = school.id;

  let { data: year } = await db.from('academic_years').select('id').eq('school_id', schoolId).eq('name', '2026-2027').maybeSingle();
  if (!year) {
    const ins = await db.from('academic_years').insert({
      school_id: schoolId, name: '2026-2027', starts_on: '2026-09-02', ends_on: '2027-07-02', status: 'ACTIVE', is_current: true,
    }).select('id').single();
    if (ins.error) throw new Error(`annee ${slug}: ${ins.error.message}`);
    year = ins.data;
  }
  const yearId = year.id;

  const periodIds = {};
  for (const p of PERIODS_SPEC) {
    let { data: existing } = await db.from('academic_periods').select('id').eq('academic_year_id', yearId).eq('sequence', p.sequence).maybeSingle();
    if (!existing) {
      const ins = await db.from('academic_periods').insert({
        school_id: schoolId, academic_year_id: yearId, name: p.name, sequence: p.sequence,
        kind: 'TERM', starts_on: p.starts_on, ends_on: p.ends_on, is_grading_period: true, weight: 1,
      }).select('id').single();
      if (ins.error) throw new Error(`periode ${p.name}: ${ins.error.message}`);
      existing = ins.data;
    }
    periodIds[p.sequence] = existing.id;
  }
  console.log('Annee et 3 trimestres prets.');

  // --- cycles/niveaux/classes ---
  const cycleIds = {};
  for (const code of ['COLLEGE', 'LYCEE']) {
    const name = code === 'COLLEGE' ? 'Collège' : 'Lycée';
    const seq = code === 'COLLEGE' ? 1 : 2;
    const { data } = await db.from('cycles').upsert({ school_id: schoolId, code, name, sequence: seq }, { onConflict: 'school_id,code' }).select('id').single();
    cycleIds[code] = data.id;
  }
  const levelIds = {};
  for (const lvl of [...COLLEGE_LEVELS, ...LYCEE_LEVELS]) {
    const cycle = COLLEGE_LEVELS.includes(lvl) ? 'COLLEGE' : 'LYCEE';
    const { data } = await db.from('levels').upsert(
      { school_id: schoolId, cycle_id: cycleIds[cycle], code: lvl.code, name: lvl.name, sequence: lvl.sequence },
      { onConflict: 'school_id,code' },
    ).select('id').single();
    levelIds[lvl.code] = data.id;
  }

  const classPlan = buildClassPlan(scale);
  const classIdByCode = new Map();
  {
    const { data: existingClasses } = await db.from('classes').select('id, code').eq('school_id', schoolId).eq('academic_year_id', yearId);
    for (const c of existingClasses ?? []) classIdByCode.set(c.code, c.id);
  }
  const toCreate = classPlan.filter((c) => !classIdByCode.has(c.code));
  if (toCreate.length > 0) {
    const rows = toCreate.map((c) => ({
      school_id: schoolId, academic_year_id: yearId, level_id: levelIds[c.levelCode], code: c.code, name: c.name, capacity: 55, status: 'ACTIVE',
    }));
    const { data, error } = await db.from('classes').insert(rows).select('id, code');
    if (error) throw new Error(`classes: ${error.message}`);
    for (const row of data) classIdByCode.set(row.code, row.id);
  }
  console.log(`${classPlan.length} classe(s) (${classIdByCode.size} au total en base).`);

  // --- salles : une par classe + quelques specialisees ---
  const { data: existingRooms } = await db.from('rooms').select('id, code').eq('school_id', schoolId);
  const roomIdByCode = new Map((existingRooms ?? []).map((r) => [r.code, r.id]));
  const roomsToCreate = [];
  for (const c of classPlan) {
    const code = `S-${c.code}`;
    if (!roomIdByCode.has(code)) roomsToCreate.push({ school_id: schoolId, code, name: `Salle ${c.name}`, capacity: 55 });
  }
  for (const code of ['GYMNASE', 'LABO-INFO', 'PERMANENCE']) {
    if (!roomIdByCode.has(code)) roomsToCreate.push({ school_id: schoolId, code, name: code === 'GYMNASE' ? 'Gymnase' : code === 'LABO-INFO' ? "Salle d'informatique" : 'Permanence', capacity: 60 });
  }
  if (roomsToCreate.length > 0) {
    const { data, error } = await db.from('rooms').insert(roomsToCreate).select('id, code');
    if (error) throw new Error(`rooms: ${error.message}`);
    for (const row of data) roomIdByCode.set(row.code, row.id);
  }
  // Salle de rattachement de chaque classe (confort, pas structurant pour le solveur).
  for (const c of classPlan) {
    const roomId = roomIdByCode.get(`S-${c.code}`);
    if (roomId) await db.from('classes').update({ main_room_id: roomId }).eq('id', classIdByCode.get(c.code));
  }
  console.log(`${roomIdByCode.size} salle(s).`);

  // --- matieres ---
  const subjectIdByCode = new Map();
  {
    const { data: existing } = await db.from('subjects').select('id, code').eq('school_id', schoolId);
    for (const s of existing ?? []) subjectIdByCode.set(s.code, s.id);
  }
  const subjectsToCreate = SUBJECTS.filter((s) => !subjectIdByCode.has(s.code)).map((s) => ({ school_id: schoolId, code: s.code, name: s.name }));
  if (subjectsToCreate.length > 0) {
    const { data, error } = await db.from('subjects').insert(subjectsToCreate).select('id, code');
    if (error) throw new Error(`subjects: ${error.message}`);
    for (const row of data) subjectIdByCode.set(row.code, row.id);
  }
  console.log(`${subjectIdByCode.size} matiere(s).`);

  // --- baremes et types d'evaluation ---
  let { data: scale20 } = await db.from('grading_scales').select('id').eq('school_id', schoolId).eq('code', 'SUR20').maybeSingle();
  if (!scale20) {
    const ins = await db.from('grading_scales').insert({
      school_id: schoolId, code: 'SUR20', name: 'Note sur 20', kind: 'NUMERIC', min_score: 0, max_score: 20, passing_score: 10, decimals: 2, rounding: 'HALF_UP', is_default: true,
    }).select('id').single();
    scale20 = ins.data;
  }
  const typeSpecs = [
    { code: 'DEVOIR', name: 'Devoir', coeff: 2, seq: 1 },
    { code: 'INTERRO', name: 'Interrogation', coeff: 1, seq: 2 },
    { code: 'EXAMEN', name: 'Examen', coeff: 3, seq: 3 },
    { code: 'PRATIQUE', name: 'Évaluation pratique', coeff: 1, seq: 4 },
  ];
  const typeIdByCode = new Map();
  for (const t of typeSpecs) {
    const { data } = await db.from('assessment_types').upsert(
      { school_id: schoolId, code: t.code, name: t.name, default_coefficient: t.coeff, counts_in_average: true, sequence: t.seq },
      { onConflict: 'school_id,code' },
    ).select('id').single();
    typeIdByCode.set(t.code, data.id);
  }
  console.log('Barème /20 par défaut et 4 types d\'évaluation prêts.');

  return { schoolId, yearId, periodIds, cycleIds, levelIds, classPlan, classIdByCode, subjectIdByCode, scaleId: scale20.id, typeIdByCode, credentials };
}

// ---------------------------------------------------------------------------
// Grille horaire (meme algorithme que src/features/schedule/config.ts:saveConfig
// — genere directement les time_slots, la generation du solveur n'a besoin
// que du resultat, pas de repasser par l'UI pour cette partie-la).
// ---------------------------------------------------------------------------

function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function toTime(min) { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`; }

/**
 * `dayHours`: {day, start, end}[] ; `breaks`: {start, end, label}[] appliquees
 * chaque jour ou elles tiennent entierement (meme regle que l'app : jamais de
 * pause coupee sur un jour raccourci).
 */
async function buildScheduleConfig({ schoolId, yearId, cycleId = null, workingDays, dayHours, slotMinutes, breaks = [] }) {
  const { data: config, error } = await db.from('schedule_configurations').insert({
    school_id: schoolId, academic_year_id: yearId, cycle_id: cycleId,
    name: cycleId ? 'Grille de cycle' : 'Grille par defaut',
    working_days: workingDays, day_starts_at: `${dayHours[0].start}:00`, day_ends_at: `${dayHours[0].end}:00`,
    default_session_minutes: slotMinutes, slot_granularity_minutes: 5, is_default: true, status: 'ACTIVE',
  }).select('id').single();
  if (error) throw new Error(`schedule_configurations: ${error.message}`);

  const breakRanges = breaks.map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end), label: b.label }));
  const slots = [];
  for (const day of workingDays) {
    const hours = dayHours.find((h) => h.day === day);
    if (!hours) continue;
    const dayStart = toMinutes(hours.start), dayEnd = toMinutes(hours.end);
    const dayBreaks = breakRanges.filter((b) => b.start >= dayStart && b.end <= dayEnd);

    const segs = [];
    let cursor = dayStart;
    for (const b of [...dayBreaks].sort((a, b2) => a.start - b2.start)) {
      if (b.start > cursor) segs.push({ start: cursor, end: b.start, kind: 'TEACHING' });
      segs.push({ start: b.start, end: b.end, kind: 'BREAK', label: b.label });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < dayEnd) segs.push({ start: cursor, end: dayEnd, kind: 'TEACHING' });

    let position = 0;
    for (const seg of segs) {
      if (seg.kind === 'BREAK') {
        slots.push({ school_id: schoolId, academic_year_id: yearId, schedule_configuration_id: config.id, day_of_week: day, position, starts_at: toTime(seg.start), ends_at: toTime(seg.end), kind: 'BREAK', label: seg.label });
        position++;
        continue;
      }
      for (let t = seg.start; t + slotMinutes <= seg.end; t += slotMinutes) {
        slots.push({ school_id: schoolId, academic_year_id: yearId, schedule_configuration_id: config.id, day_of_week: day, position, starts_at: toTime(t), ends_at: toTime(t + slotMinutes), kind: 'TEACHING' });
        position++;
      }
    }
  }
  await chunkedInsert('time_slots', slots);
  return config.id;
}

// ---------------------------------------------------------------------------
// Enseignants + affectations (charge inegale : plein temps / mi-temps)
// ---------------------------------------------------------------------------

async function buildTeachers(built, schoolIndex) {
  const { schoolId, yearId, classPlan, classIdByCode, subjectIdByCode, credentials } = built;
  const FULL_MIN = 18 * 60;
  const HALF_MIN = 9 * 60;

  let staffSeq = 1;
  const creds = [];

  for (const subject of SUBJECTS) {
    const classesForSubject = classPlan.filter((c) => subjectAppliesTo(subject, c.levelCode));
    if (classesForSubject.length === 0) continue;
    const classMinutes = subject.hours * 60;

    let teacherIndexForSubject = 0;
    let current = null; // { teacherId, remaining, cycle }
    for (const c of classesForSubject) {
      // Jamais un enseignant a cheval sur College/Lycee : chaque cycle a son
      // propre horaire (grilles distinctes pour l'Ecole 1) ; un enseignant
      // partage entre les deux peut se retrouver reellement occupe par ses
      // seances de l'un au moment ou le solveur voudrait placer l'autre — un
      // etablissement de cette taille a de toute facon des corps enseignants
      // distincts par cycle.
      if (!current || current.remaining < classMinutes || current.cycle !== c.cycle) {
        teacherIndexForSubject++;
        const isFullTime = teacherIndexForSubject % 2 === 1;
        const capacity = isFullTime ? FULL_MIN : HALF_MIN;
        const staffNumber = `ENS-${schoolIndex}-${String(staffSeq).padStart(4, '0')}`;
        const firstName = FIRST_NAMES[(staffSeq * 7) % FIRST_NAMES.length];
        const lastName = LAST_NAMES[(staffSeq * 13) % LAST_NAMES.length];
        staffSeq++;

        const isCredentialTeacher = teacherIndexForSubject === 1; // le premier prof de chaque matiere = celui remis en identifiant
        let userId = null;
        if (isCredentialTeacher) {
          const email = `prof.${subject.code.toLowerCase()}@${built.slugForEmail}.geschool.local`;
          userId = await getOrCreateUser({ email, meta: { display_name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName } });
          await ensureMembership(schoolId, userId, 'TEACHER');
          await ensureAccess(schoolId, userId, 'EMAIL', email, 'TEACHER');
          creds.push({ subject: subject.name, email });
        }

        const { data: teacher, error } = await db.from('teachers').insert({
          school_id: schoolId, user_id: userId, staff_number: staffNumber, first_name: firstName, last_name: lastName, status: 'ACTIVE',
        }).select('id').single();
        if (error) throw new Error(`teacher ${staffNumber}: ${error.message}`);

        current = { teacherId: teacher.id, remaining: capacity, cycle: c.cycle };
      }

      await db.from('teaching_assignments').insert({
        school_id: schoolId, academic_year_id: yearId, teacher_id: current.teacherId, subject_id: subjectIdByCode.get(subject.code),
        class_id: classIdByCode.get(c.code), weekly_minutes: classMinutes, status: 'ACTIVE',
      });
      current.remaining -= classMinutes;
    }
  }
  console.log(`${staffSeq - 1} enseignant(s), affectations creees.`);
  credentials.teachers = creds;
}

const FIRST_NAMES = ['Kouassi', 'Awa', 'Ibrahim', 'Aminata', 'Yao', 'Fatoumata', 'Mamadou', 'Adjoua', 'Sekou', 'Aya', 'Boubacar', 'Affoue', 'Moussa', 'Akissi', 'Drissa'];
const LAST_NAMES = ['Kone', 'Traore', 'Diabate', 'Ouattara', 'Bamba', 'Coulibaly', 'Yao', 'Kouame', 'Silue', 'Toure', 'Sanogo', 'Diarra'];

// ---------------------------------------------------------------------------
// Eleves + tuteurs (comptes reels seulement pour un parent par NIVEAU)
// ---------------------------------------------------------------------------

async function buildStudents(built, schoolIndex) {
  const { schoolId, yearId, classPlan, classIdByCode, credentials } = built;
  const STUDENTS_PER_CLASS = 50;
  const creditedLevels = new Set(); // un seul parent avec identifiant, par niveau
  const parentCreds = [];

  let studentSeq = 1;
  let guardianSeq = 1;

  for (const c of classPlan) {
    const classId = classIdByCode.get(c.code);
    const studentRows = [];
    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
      const firstName = FIRST_NAMES[(studentSeq * 3) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(studentSeq * 11) % LAST_NAMES.length];
      studentRows.push({
        school_id: schoolId,
        matricule: `ELV-${schoolIndex}-${String(studentSeq).padStart(6, '0')}`,
        first_name: firstName,
        last_name: `${lastName}${studentSeq}`, // desambiguise : meme prenom/nom de famille reviennent souvent avec un petit pool
        gender: studentSeq % 2 === 0 ? 'M' : 'F',
        status: 'ACTIVE',
      });
      studentSeq++;
    }
    const studentIds = await chunkedInsertReturning('students', studentRows);

    const enrollRows = studentIds.map((sid) => ({ school_id: schoolId, student_id: sid, academic_year_id: yearId, class_id: classId, status: 'ENROLLED' }));
    await chunkedInsert('student_enrollments', enrollRows);

    // Un tuteur par eleve (donnee seule, sauf le premier eleve du niveau : compte reel).
    const guardianRows = [];
    for (let i = 0; i < studentIds.length; i++) {
      guardianRows.push({
        school_id: schoolId,
        first_name: FIRST_NAMES[(guardianSeq * 5) % FIRST_NAMES.length],
        last_name: LAST_NAMES[(guardianSeq * 17) % LAST_NAMES.length],
        phone_e164: e164(schoolIndex, guardianSeq),
        phone_display: e164(schoolIndex, guardianSeq),
        status: 'ACTIVE',
      });
      guardianSeq++;
    }
    const guardianIds = await chunkedInsertReturning('guardians', guardianRows);

    const linkRows = studentIds.map((sid, i) => ({ school_id: schoolId, student_id: sid, guardian_id: guardianIds[i], relationship: 'FATHER', is_legal_guardian: true, is_primary_contact: true }));
    await chunkedInsert('student_guardians', linkRows);

    if (!creditedLevels.has(c.levelCode)) {
      creditedLevels.add(c.levelCode);
      const guardianId = guardianIds[0];
      const { data: g } = await db.from('guardians').select('phone_e164, first_name, last_name').eq('id', guardianId).single();
      // L'identifiant de connexion reste le telephone (E.164, deja unique) ;
      // l'email n'est qu'un identifiant technique du compte auth.users et DOIT
      // etre unique lui aussi — un prenom seul (pool de 15) collisionnerait
      // vite sur 7 niveaux et ferait retrouver deux parents sur le meme compte.
      const email = `parent.${c.levelCode.toLowerCase()}.${schoolIndex}@accounts.invalid`;
      const userId = await getOrCreateUser({ email, meta: { display_name: `${g.first_name} ${g.last_name}` }, mustChange: true });
      await db.from('guardians').update({ user_id: userId }).eq('id', guardianId);
      await ensureMembership(schoolId, userId, 'PARENT');
      await ensureAccess(schoolId, userId, 'PHONE', g.phone_e164, 'GUARDIAN', true);
      parentCreds.push({ level: c.levelName, phone: g.phone_e164 });
    }
  }
  console.log(`${studentSeq - 1} eleve(s), ${guardianSeq - 1} tuteur(s).`);
  credentials.parents = parentCreds;
}

// ---------------------------------------------------------------------------
// Administrateur de l'etablissement
// ---------------------------------------------------------------------------

async function buildAdmin(built) {
  const email = `admin@${built.slugForEmail}.geschool.local`;
  const userId = await getOrCreateUser({ email, meta: { display_name: 'Administration' } });
  await ensureMembership(built.schoolId, userId, 'SCHOOL_ADMIN');
  await ensureAccess(built.schoolId, userId, 'EMAIL', email, 'STAFF');
  built.credentials.admin = email;
  console.log(`Administrateur : ${email}`);
}

// ---------------------------------------------------------------------------
// Orchestration par ecole
// ---------------------------------------------------------------------------

const SCHOOL_SPECS = [
  { index: 1, slug: 'gs-cocotiers', slugForEmail: 'cocotiers', name: 'Groupe Scolaire Les Cocotiers', scale: 'large', schedule: 'per-cycle' },
  { index: 2, slug: 'gs-renaissance', slugForEmail: 'renaissance', name: 'Groupe Scolaire La Renaissance', scale: 'small', schedule: 'single' },
  { index: 3, slug: 'gs-flamboyants', slugForEmail: 'flamboyants', name: 'Groupe Scolaire Les Flamboyants', scale: 'small', schedule: 'none' },
];

const STANDARD_WEEK = [1, 2, 3, 4, 5];

async function seedScheduleGrid(built, spec) {
  if (spec.schedule === 'none') { console.log('Grille horaire : aucune (générez-la vous-même).'); return; }
  if (spec.schedule === 'single') {
    // 07:30-14:00 (pas 13:30) : une seule grille pour tout l'etablissement,
    // donc dimensionnee pour le besoin le plus lourd (classes 1ere/Terminale
    // avec Philosophie en plus des 11 autres matieres = 28 creneaux/semaine).
    await buildScheduleConfig({
      schoolId: built.schoolId, yearId: built.yearId, workingDays: STANDARD_WEEK,
      dayHours: STANDARD_WEEK.map((day) => ({ day, start: '07:30', end: '14:00' })), slotMinutes: 55,
      breaks: [{ start: '10:00', end: '10:20', label: 'Récréation' }],
    });
    console.log('Grille horaire par défaut (07:30-14:00, récréation 10h-10h20) prête.');
    return;
  }
  // 'per-cycle' : Ecole 1, deux grilles distinctes pour exercer generation par cycle + pauses differentes.
  // 14:00 (pas 13:30) : a exactement 25 creneaux/semaine (le juste besoin), le
  // solveur s'est revele reellement INFEASIBLE — des enseignants partages
  // entre plusieurs classes du meme cycle n'ont aucune marge pour se
  // reorganiser. Une grille sans aucune marge est une mauvaise idee meme quand
  // l'arithmetique tombe juste ; 30 creneaux laisse de la marge reelle.
  await buildScheduleConfig({
    schoolId: built.schoolId, yearId: built.yearId, cycleId: built.cycleIds.COLLEGE,
    workingDays: STANDARD_WEEK, dayHours: STANDARD_WEEK.map((day) => ({ day, start: '07:30', end: '14:00' })), slotMinutes: 55,
    breaks: [{ start: '10:00', end: '10:20', label: 'Récréation' }],
  });
  // 14:30 (pas 14:00) : les classes 1ere/Terminale ajoutent Philosophie aux 11
  // autres matieres (28 creneaux/semaine necessaires) ; avec 2 pauses (recre +
  // dejeuner) qui mangent plus de temps que la pause unique du college, 14:00
  // ne suffisait pas (verifie par une generation reellement infaisable).
  await buildScheduleConfig({
    schoolId: built.schoolId, yearId: built.yearId, cycleId: built.cycleIds.LYCEE,
    workingDays: STANDARD_WEEK, dayHours: STANDARD_WEEK.map((day) => ({ day, start: '07:30', end: '14:30' })), slotMinutes: 55,
    breaks: [{ start: '10:15', end: '10:35', label: 'Récréation' }, { start: '12:30', end: '13:10', label: 'Pause déjeuner' }],
  });
  console.log('Grilles par cycle prêtes : Collège (07:30-14:00, récré 10h-10h20) et Lycée (07:30-14:30, récré + pause déjeuner).');
}

// ---------------------------------------------------------------------------
// Notes (evaluations + notes) — independant de l'emploi du temps genere : les
// evaluations ne referencent pas schedule_sessions, seulement les affectations
// d'enseignement et les periodes, deja en place apres buildTeachers/buildSchool.
// ---------------------------------------------------------------------------

const ASSESSMENT_TYPE_CYCLE = ['DEVOIR', 'INTERRO', 'DEVOIR', 'EXAMEN'];
const TYPE_LABEL = { DEVOIR: 'Devoir', INTERRO: 'Interrogation', EXAMEN: 'Examen', PRATIQUE: 'Évaluation pratique' };
const TYPE_COEFF = { DEVOIR: 2, INTERRO: 1, EXAMEN: 3, PRATIQUE: 1 };

function randomScore() {
  const base = 8 + Math.random() * 9; // 8..17
  const jitter = (Math.random() - 0.5) * 4; // -2..2
  const score = Math.max(2, Math.min(19.5, base + jitter));
  return Math.round(score * 2) / 2; // pas de 0.5
}

function dateWithinPeriod(periodSeq, index, count) {
  const p = PERIODS_SPEC.find((x) => x.sequence === periodSeq);
  const start = new Date(`${p.starts_on}T00:00:00Z`).getTime();
  const end = new Date(`${p.ends_on}T00:00:00Z`).getTime();
  const t = start + ((end - start) * (index + 1)) / (count + 1);
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * `periodSeqs` : trimestres a couvrir (1..3). `evalCount` : evaluations par
 * (classe, matiere, trimestre). `statusFor(seq)` : statut des evaluations de
 * ce trimestre ('PUBLISHED' | 'CLOSED' | 'OPEN' | 'DRAFT').
 */
async function buildGrades(built, { periodSeqs, evalCount, statusFor }) {
  const { schoolId, yearId, periodIds, typeIdByCode, scaleId } = built;

  const tas = await fetchAllRows('teaching_assignments', 'class_id, subject_id, teacher_id', (q) =>
    q.eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'ACTIVE').not('class_id', 'is', null),
  );

  const enrolls = await fetchAllRows('student_enrollments', 'class_id, student_id', (q) =>
    q.eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'ENROLLED'),
  );
  const studentsByClass = new Map();
  for (const e of enrolls) {
    const list = studentsByClass.get(e.class_id) ?? [];
    list.push(e.student_id);
    studentsByClass.set(e.class_id, list);
  }

  const assessmentRows = [];
  const studentsPerRow = [];
  for (const ta of tas ?? []) {
    const students = studentsByClass.get(ta.class_id) ?? [];
    if (students.length === 0) continue;
    for (const periodSeq of periodSeqs) {
      const status = statusFor(periodSeq);
      const period = PERIODS_SPEC.find((p) => p.sequence === periodSeq);
      for (let i = 0; i < evalCount; i++) {
        const typeCode = ASSESSMENT_TYPE_CYCLE[i % ASSESSMENT_TYPE_CYCLE.length];
        assessmentRows.push({
          school_id: schoolId, academic_year_id: yearId, academic_period_id: periodIds[periodSeq],
          subject_id: ta.subject_id, class_id: ta.class_id, teacher_id: ta.teacher_id,
          assessment_type_id: typeIdByCode.get(typeCode),
          title: `${TYPE_LABEL[typeCode]} n°${i + 1}`,
          assessment_date: dateWithinPeriod(periodSeq, i, evalCount),
          grading_scale_id: scaleId, max_score: 20, coefficient: TYPE_COEFF[typeCode],
          sequence_number: i + 1, status,
          published_at: status === 'PUBLISHED' ? `${period.ends_on}T12:00:00Z` : null,
        });
        studentsPerRow.push(students);
      }
    }
  }

  console.log(`Insertion de ${assessmentRows.length} evaluation(s)...`);
  const assessmentIds = await chunkedInsertReturning('assessments', assessmentRows);

  const gradeRows = [];
  assessmentIds.forEach((id, i) => {
    for (const studentId of studentsPerRow[i]) {
      const absent = Math.random() < 0.03;
      gradeRows.push({
        school_id: schoolId, assessment_id: id, student_id: studentId,
        score: absent ? null : randomScore(), is_absent: absent,
      });
    }
  });
  console.log(`Insertion de ${gradeRows.length} note(s)...`);
  await chunkedInsert('grades', gradeRows, 1000);
  console.log(`${assessmentIds.length} evaluation(s), ${gradeRows.length} note(s) creees.`);
}

async function seedSchool(spec) {
  const credentials = {};
  const built = await buildSchool({ ...spec, credentials });
  built.slugForEmail = spec.slugForEmail;
  await buildAdmin(built);
  await buildTeachers(built, spec.index);
  await buildStudents(built, spec.index);
  await seedScheduleGrid(built, spec);

  console.log(`\n--- Identifiants — ${spec.name} (mot de passe : ${PASSWORD}) ---`);
  console.log(`Administrateur : ${credentials.admin}`);
  console.log('Enseignants (un par matière) :');
  for (const t of credentials.teachers) console.log(`  ${t.subject.padEnd(24)} ${t.email}`);
  console.log('Parents (un par niveau, premiere connexion imposee) :');
  for (const p of credentials.parents) console.log(`  ${p.level.padEnd(12)} ${p.phone}`);

  return built;
}

/**
 * Repare les identifiants d'une ecole deja construite avec l'ancien bug
 * (account_access sans activated_at -> echec silencieux pour admin/profs ;
 * email de parent non unique -> collision entre niveaux). Ne touche a aucune
 * donnee pedagogique, uniquement les comptes de connexion.
 */
async function repairAccess(spec) {
  const { data: school } = await db.from('schools').select('id').eq('slug', spec.slug).single();
  const schoolId = school.id;

  // --- admin (idempotent, juste re-ecrit account_access correctement) ---
  await buildAdmin({ schoolId, slugForEmail: spec.slugForEmail, credentials: {} });

  // --- enseignants credites : deja lies via teachers.user_id, il ne manque que account_access ---
  const teacherCreds = [];
  for (const subject of SUBJECTS) {
    const email = `prof.${subject.code.toLowerCase()}@${spec.slugForEmail}.geschool.local`;
    const userId = await getOrCreateUser({ email, meta: {} }); // recupere l'utilisateur existant (meme email)
    await ensureMembership(schoolId, userId, 'TEACHER');
    await ensureAccess(schoolId, userId, 'EMAIL', email, 'TEACHER');
    teacherCreds.push({ subject: subject.name, email });
  }

  // --- parents : nettoie les comptes colles par collision, puis recredite un parent par niveau ---
  const { data: badGuardians } = await db.from('guardians').select('id, user_id').eq('school_id', schoolId).not('user_id', 'is', null);
  const badUserIds = Array.from(new Set((badGuardians ?? []).map((g) => g.user_id)));
  for (const uid of badUserIds) {
    await db.from('guardians').update({ user_id: null }).eq('user_id', uid);
    await db.auth.admin.deleteUser(uid).catch(() => {});
  }

  const allLevels = [...COLLEGE_LEVELS, ...LYCEE_LEVELS];
  const parentCreds = [];
  for (const lvl of allLevels) {
    const { data: level } = await db.from('levels').select('id').eq('school_id', schoolId).eq('code', lvl.code).single();
    const { data: klass } = await db.from('classes').select('id').eq('school_id', schoolId).eq('level_id', level.id).limit(1).single();
    const { data: enr } = await db.from('student_enrollments').select('student_id').eq('class_id', klass.id).limit(1).single();
    const { data: link } = await db.from('student_guardians').select('guardian_id').eq('student_id', enr.student_id).limit(1).single();
    const { data: g } = await db.from('guardians').select('id, phone_e164, first_name, last_name').eq('id', link.guardian_id).single();

    const email = `parent.${lvl.code.toLowerCase()}.${spec.index}@accounts.invalid`;
    const userId = await getOrCreateUser({ email, meta: { display_name: `${g.first_name} ${g.last_name}` }, mustChange: true });
    await db.from('guardians').update({ user_id: userId }).eq('id', g.id);
    await ensureMembership(schoolId, userId, 'PARENT');
    await ensureAccess(schoolId, userId, 'PHONE', g.phone_e164, 'GUARDIAN', true);
    parentCreds.push({ level: lvl.name, phone: g.phone_e164 });
  }

  console.log(`\n--- Identifiants corrigés — ${spec.name} (mot de passe : ${PASSWORD}) ---`);
  console.log(`Administrateur : admin@${spec.slugForEmail}.geschool.local`);
  console.log('Enseignants (un par matière) :');
  for (const t of teacherCreds) console.log(`  ${t.subject.padEnd(24)} ${t.email}`);
  console.log('Parents (un par niveau, premiere connexion imposee) :');
  for (const p of parentCreds) console.log(`  ${p.level.padEnd(12)} ${p.phone}`);
}

/** Recharge les identifiants deja crees par buildSchool, pour ajouter la grille apres coup (sans tout reconstruire). */
async function gridOnly(spec) {
  const { data: school } = await db.from('schools').select('id').eq('slug', spec.slug).single();
  const { data: year } = await db.from('academic_years').select('id').eq('school_id', school.id).eq('name', '2026-2027').single();
  const { data: cycles } = await db.from('cycles').select('id, code').eq('school_id', school.id);
  const cycleIds = Object.fromEntries(cycles.map((c) => [c.code, c.id]));
  await seedScheduleGrid({ schoolId: school.id, yearId: year.id, cycleIds }, spec);
}

/**
 * Recharge les identifiants deja crees par buildSchool, pour ajouter les
 * notes apres coup (independant de l'emploi du temps — pas besoin qu'il ait
 * ete genere). Ecole 1 : annee complete (3 trimestres, T3 CLOSED pour tester
 * la publication). Ecole 2 : milieu de trimestre 1 seulement (OPEN). Ecole 3 :
 * aucune (debut d'annee, pas d'emploi du temps).
 */
async function gradesOnly(spec) {
  const { data: school } = await db.from('schools').select('id').eq('slug', spec.slug).single();
  const { data: year } = await db.from('academic_years').select('id').eq('school_id', school.id).eq('name', '2026-2027').single();
  const { data: periods } = await db.from('academic_periods').select('id, sequence').eq('academic_year_id', year.id);
  const periodIds = Object.fromEntries(periods.map((p) => [p.sequence, p.id]));
  const { data: types } = await db.from('assessment_types').select('id, code').eq('school_id', school.id);
  const typeIdByCode = new Map(types.map((t) => [t.code, t.id]));
  const { data: scale } = await db.from('grading_scales').select('id').eq('school_id', school.id).eq('code', 'SUR20').single();

  const built = { schoolId: school.id, yearId: year.id, periodIds, typeIdByCode, scaleId: scale.id };

  if (spec.index === 1) {
    await buildGrades(built, { periodSeqs: [1, 2, 3], evalCount: 4, statusFor: (seq) => (seq === 3 ? 'CLOSED' : 'PUBLISHED') });
  } else if (spec.index === 2) {
    await buildGrades(built, { periodSeqs: [1], evalCount: 2, statusFor: () => 'OPEN' });
  } else {
    console.log('Pas de notes prevues pour cet etablissement (debut d\'annee, pas d\'emploi du temps).');
  }
}

async function main() {
  const only = argVal('--school');
  const gridFor = argVal('--grid');
  if (gridFor) { await gridOnly(SCHOOL_SPECS.find((s) => String(s.index) === gridFor)); return; }
  const gradesFor = argVal('--grades');
  if (gradesFor) { await gradesOnly(SCHOOL_SPECS.find((s) => String(s.index) === gradesFor)); return; }
  const repairFor = argVal('--repair');
  if (repairFor) { await repairAccess(SCHOOL_SPECS.find((s) => String(s.index) === repairFor)); return; }

  const targets = has('--all') ? SCHOOL_SPECS : SCHOOL_SPECS.filter((s) => String(s.index) === only);

  if (has('--reset') || has('--all')) {
    console.log('--- Suppression des donnees de demonstration existantes ---');
    await resetSchool('demo');
    for (const spec of targets) await resetSchool(spec.slug);
  }

  if (targets.length === 0) {
    console.log('Rien a faire : precisez --school=1|2|3 ou --all (avec --reset en option), ou --grid=1|2 pour ajouter juste la grille.');
    return;
  }
  for (const spec of targets) await seedSchool(spec);
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nEchec :', e); process.exit(1); });
