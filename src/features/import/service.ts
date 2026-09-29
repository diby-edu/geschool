import 'server-only';

import { ZodError } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission, requireWritable } from '@/lib/permissions';
import { AuthorizationError, isAppError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import { audit } from '@/lib/audit';
import { normalizeHeader } from '@/lib/csv-parse';
import { roomSchema } from '@/features/rooms/schemas';
import { classSchema } from '@/features/classes/schemas';
import { teacherSchema } from '@/features/teachers/schemas';
import { staffSchema } from '@/features/staff/schemas';
import { enrollSchemaFor } from '@/features/students/schemas';
import { createRoom, createRoomType } from '@/features/rooms/service';
import { createClass } from '@/features/classes/service';
import { createTeacher } from '@/features/teachers/service';
import { createStaff } from '@/services/staff';
import { enrollStudent } from '@/services/enrollment';
import { assignLanguageGroup } from '@/features/groups/language';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';
import { IMPORT_KINDS, mapColumns, rowValues, type ColumnMapping, type ImportKind } from './kinds';
import type { ImportPreview, ImportRow, RowOutcome } from './types';
import {
  normCode,
  parseBool,
  parseCount,
  parseDate,
  parseDiploma,
  parseEmployment,
  parseFunctions,
  parseGender,
  parseRelationship,
  parseYesNo,
  parseAssigned,
  parseTeacherStatus,
  splitFullName,
} from './values';

/**
 * Import de listes (salles, classes, enseignants, personnel, élèves) depuis un
 * CSV. Deux temps, toujours depuis les cellules BRUTES envoyées par le
 * navigateur (rien de ce qu'il a calculé n'est cru) :
 *  1. previewImport : chaque ligne est vérifiée — prête, ignorée (déjà
 *     présente, doublon du fichier) ou en erreur, avec la raison ;
 *  2. importRows : les lignes prêtes sont créées une par une, par les MÊMES
 *     services que les formulaires (droits, garde-fous, audit identiques).
 * Le navigateur envoie les lignes par petits lots : un fichier de 800 élèves
 * ne tient pas dans une seule requête (chaque inscription crée un compte parent).
 *
 * Jamais de mise à jour : un élément déjà présent (même code, même matricule…)
 * est laissé tel quel et signalé « ignoré ».
 */

export type { ImportPreview, ImportRow, RowOutcome } from './types';

type Plan = RowOutcome & { run?: () => Promise<string | undefined> };
type Supabase = Awaited<ReturnType<typeof createClient>>;

const REQUIRED_PERMISSIONS: Record<ImportKind, string[]> = {
  rooms: ['rooms.create'],
  classes: ['classes.create'],
  teachers: ['teachers.create'],
  staff: ['users.create', 'users.assign_roles'],
  // Importer engage des centaines de dossiers d'un coup : le droit d'inscrire
  // un eleve ne suffit pas, celui d'importer s'y ajoute.
  students: ['students.create', 'students.import'],
};

export function canImport(ctx: TenantContext, kind: ImportKind): boolean {
  return REQUIRED_PERMISSIONS[kind].every((p) => hasPermission(ctx, p));
}

/** Clé de comparaison souple : « Tle C », « TLE-C » et « tle c » se rejoignent. */
const loose = (v: string) => normCode(v).replace(/[^A-Z0-9]/g, '');

function reason(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Valeur invalide.';
  console.error('[import]', error);
  return 'Erreur inattendue : ligne non importée.';
}

function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? 'Valeur invalide.';
}

/** Numéro de téléphone lisible -> E.164, ou message d'erreur. */
function phoneCheck(ctx: TenantContext, raw: string, label: string): { phone?: string; error?: string } {
  if (!raw) return {};
  const phone = normalizePhone(raw, ctx.school.countryCode);
  return phone ? { phone } : { error: `${label} invalide : ${raw}` };
}

// ---------------------------------------------------------------------------
// Salles
// ---------------------------------------------------------------------------

async function planRooms(ctx: TenantContext, supabase: Supabase, mapping: ColumnMapping, rows: ImportRow[]): Promise<Plan[]> {
  const [roomsRes, typesRes] = await Promise.all([
    supabase.from('rooms').select('code').eq('school_id', ctx.school.id),
    supabase.from('room_types').select('id, code, name').eq('school_id', ctx.school.id),
  ]);
  if (roomsRes.error) throw roomsRes.error;
  if (typesRes.error) throw typesRes.error;
  const existing = new Set((roomsRes.data ?? []).map((r) => loose(r.code)));
  const typeIds = new Map<string, string>();
  for (const t of typesRes.data ?? []) {
    typeIds.set(loose(t.code), t.id);
    typeIds.set(loose(t.name), t.id);
  }
  const seen = new Set<string>();

  return rows.map(({ line, cells }) => {
    const v = rowValues(mapping, cells);
    const label = [v.code, v.name].filter(Boolean).join(' · ') || `Ligne ${line}`;
    const capacity = parseCount(v.capacity ?? '', 0);
    const isActive = parseBool(v.active ?? '', true);
    if (capacity === undefined) return { line, label, status: 'error', message: `Capacité invalide : ${v.capacity}` };
    if (isActive === undefined) return { line, label, status: 'error', message: `« Active » attend Oui ou Non : ${v.active}` };
    const parsed = roomSchema.safeParse({
      code: v.code ?? '',
      name: v.name ?? '',
      capacity,
      building: v.building ?? '',
      floor: v.floor ?? '',
      isActive,
      roomTypeId: '',
    });
    if (!parsed.success) return { line, label, status: 'error', message: zodMessage(parsed.error) };
    const key = loose(parsed.data.code);
    if (existing.has(key)) return { line, label, status: 'skip', message: 'Déjà présente (même code).' };
    if (seen.has(key)) return { line, label, status: 'skip', message: 'En double dans le fichier.' };
    seen.add(key);

    const typeName = (v.type ?? '').trim();
    const knownType = typeName ? typeIds.get(loose(typeName)) : undefined;
    return {
      line,
      label,
      status: 'ready',
      ...(typeName && !knownType ? { message: `Type « ${typeName} » créé au passage.` } : {}),
      run: async () => {
        let roomTypeId = typeName ? typeIds.get(loose(typeName)) : undefined;
        if (typeName && !roomTypeId) {
          const code = normCode(typeName).replace(/[^A-Z0-9-]/g, '').slice(0, 20) || 'TYPE';
          // Type créé à l'import : il vaut pour tous les ordres de l'école,
          // le fichier ne dit rien à ce sujet.
          await createRoomType(ctx, { code, name: typeName.slice(0, 80), tracks: [] }).catch(() => undefined);
          const { data } = await supabase
            .from('room_types')
            .select('id')
            .eq('school_id', ctx.school.id)
            .eq('code', code)
            .maybeSingle();
          roomTypeId = data?.id;
          if (roomTypeId) typeIds.set(loose(typeName), roomTypeId);
        }
        await createRoom(ctx, { ...parsed.data, roomTypeId: roomTypeId ?? '' });
        return undefined;
      },
    } satisfies Plan;
  });
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

async function planClasses(ctx: TenantContext, supabase: Supabase, mapping: ColumnMapping, rows: ImportRow[]): Promise<Plan[]> {
  const year = ctx.academicYear;
  if (!year) return rows.map(({ line }) => ({ line, label: `Ligne ${line}`, status: 'error', message: 'Aucune année scolaire active.' }));
  const [levelsRes, classesRes, teachersRes, roomsRes] = await Promise.all([
    supabase.from('levels').select('id, code, name').eq('school_id', ctx.school.id),
    supabase.from('classes').select('code').eq('school_id', ctx.school.id).eq('academic_year_id', year.id),
    supabase.from('teachers').select('id, staff_number').eq('school_id', ctx.school.id),
    supabase.from('rooms').select('id, code').eq('school_id', ctx.school.id),
  ]);
  for (const r of [levelsRes, classesRes, teachersRes, roomsRes]) if (r.error) throw r.error;
  const levels = new Map<string, string>();
  for (const l of levelsRes.data ?? []) {
    levels.set(loose(l.code), l.id);
    levels.set(loose(l.name), l.id);
  }
  const existing = new Set((classesRes.data ?? []).map((c) => loose(c.code)));
  const teachers = new Map((teachersRes.data ?? []).map((t) => [loose(t.staff_number), t.id]));
  const rooms = new Map((roomsRes.data ?? []).map((r) => [loose(r.code), r.id]));
  const seen = new Set<string>();

  return rows.map(({ line, cells }) => {
    const v = rowValues(mapping, cells);
    const label = [v.code, v.name].filter(Boolean).join(' · ') || `Ligne ${line}`;
    const levelId = v.level ? levels.get(loose(v.level)) : undefined;
    if (!levelId) return { line, label, status: 'error', message: v.level ? `Niveau inconnu : ${v.level}` : 'Niveau requis.' };
    const capacity = parseCount(v.capacity ?? '', 0);
    if (capacity === undefined) return { line, label, status: 'error', message: `Capacité invalide : ${v.capacity}` };
    const headTeacherId = v.headTeacher ? teachers.get(loose(v.headTeacher)) : '';
    if (headTeacherId === undefined) return { line, label, status: 'error', message: `Professeur principal introuvable (matricule ${v.headTeacher}).` };
    const mainRoomId = v.room ? rooms.get(loose(v.room)) : '';
    if (mainRoomId === undefined) return { line, label, status: 'error', message: `Salle introuvable : ${v.room}` };
    const parsed = classSchema.safeParse({ levelId, code: v.code ?? '', name: v.name ?? '', capacity, headTeacherId, mainRoomId });
    if (!parsed.success) return { line, label, status: 'error', message: zodMessage(parsed.error) };
    const key = loose(parsed.data.code);
    if (existing.has(key)) return { line, label, status: 'skip', message: 'Déjà présente cette année (même code).' };
    if (seen.has(key)) return { line, label, status: 'skip', message: 'En double dans le fichier.' };
    seen.add(key);
    return {
      line,
      label,
      status: 'ready',
      run: async () => {
        await createClass(ctx, parsed.data);
        return undefined;
      },
    } satisfies Plan;
  });
}

// ---------------------------------------------------------------------------
// Enseignants
// ---------------------------------------------------------------------------

async function planTeachers(ctx: TenantContext, supabase: Supabase, mapping: ColumnMapping, rows: ImportRow[]): Promise<Plan[]> {
  const { data, error } = await supabase.from('teachers').select('staff_number').eq('school_id', ctx.school.id);
  if (error) throw error;
  const existing = new Set((data ?? []).map((t) => loose(t.staff_number)));
  const seen = new Set<string>();

  return rows.map(({ line, cells }) => {
    const v = rowValues(mapping, cells);
    const label = [v.lastName?.toUpperCase(), v.firstName].filter(Boolean).join(' ') || `Ligne ${line}`;
    const gender = parseGender(v.gender ?? '');
    const birthDate = parseDate(v.birthDate ?? '');
    const hireDate = parseDate(v.hireDate ?? '');
    const employmentType = v.employmentType ? parseEmployment(v.employmentType) : 'OTHER';
    const status = parseTeacherStatus(v.status ?? '');
    const diplomaCode = parseDiploma(v.diploma ?? '');
    const phone = phoneCheck(ctx, v.phone ?? '', 'Téléphone');
    if (gender === undefined) return { line, label, status: 'error', message: `Sexe : M ou F attendu (${v.gender}).` };
    if (birthDate === undefined) return { line, label, status: 'error', message: `Date de naissance invalide (jj/mm/aaaa) : ${v.birthDate}` };
    if (hireDate === undefined) return { line, label, status: 'error', message: `Date de prise de fonction invalide (jj/mm/aaaa) : ${v.hireDate}` };
    if (!employmentType) return { line, label, status: 'error', message: `Type de contrat inconnu : ${v.employmentType}` };
    if (!status) return { line, label, status: 'error', message: `Statut inconnu : ${v.status}` };
    if (phone.error) return { line, label, status: 'error', message: phone.error };
    const parsed = teacherSchema.safeParse({
      staffNumber: v.staffNumber ?? '',
      firstName: v.firstName ?? '',
      lastName: v.lastName ?? '',
      gender,
      birthDate,
      phone: v.phone ?? '',
      email: v.email ?? '',
      address: '',
      specialty: v.specialty ?? '',
      employmentType,
      status,
      hireDate,
      // Diplôme hors liste : « Autre », avec l'intitulé d'origine en précision.
      diploma: diplomaCode ?? 'AUTRE',
      diplomaDetail: diplomaCode === undefined ? (v.diploma ?? '').slice(0, 160) : '',
    });
    if (!parsed.success) return { line, label, status: 'error', message: zodMessage(parsed.error) };
    const key = loose(parsed.data.staffNumber);
    if (existing.has(key)) return { line, label, status: 'skip', message: 'Déjà présent (même matricule).' };
    if (seen.has(key)) return { line, label, status: 'skip', message: 'En double dans le fichier.' };
    seen.add(key);
    return {
      line,
      label,
      status: 'ready',
      run: async () => {
        await createTeacher(ctx, parsed.data);
        return undefined;
      },
    } satisfies Plan;
  });
}

// ---------------------------------------------------------------------------
// Personnel administratif
// ---------------------------------------------------------------------------

async function planStaff(ctx: TenantContext, supabase: Supabase, mapping: ColumnMapping, rows: ImportRow[]): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('staff_profiles' as never)
    .select('phone_e164, staff_number')
    .eq('school_id', ctx.school.id);
  if (error) throw error;
  const profiles = (data ?? []) as unknown as { phone_e164: string | null; staff_number: string | null }[];
  const phones = new Set(profiles.map((p) => p.phone_e164).filter(Boolean));
  const numbers = new Set(profiles.map((p) => (p.staff_number ? loose(p.staff_number) : '')).filter(Boolean));
  const seen = new Set<string>();

  return rows.map(({ line, cells }) => {
    const v = rowValues(mapping, cells);
    const label = [v.lastName?.toUpperCase(), v.firstName].filter(Boolean).join(' ') || `Ligne ${line}`;
    const gender = parseGender(v.gender ?? '');
    const functions = parseFunctions(v.functions ?? '');
    const employmentType = v.employmentType ? parseEmployment(v.employmentType) : 'OTHER';
    const birthDate = parseDate(v.birthDate ?? '');
    const hireDate = parseDate(v.hireDate ?? '');
    const phone = phoneCheck(ctx, v.phone ?? '', 'Téléphone');
    if (!gender) return { line, label, status: 'error', message: `Sexe : M ou F attendu${v.gender ? ` (${v.gender})` : ''}.` };
    if (!functions || functions.length === 0) return { line, label, status: 'error', message: v.functions ? `Fonction inconnue : ${v.functions}` : 'Fonction requise.' };
    if (!employmentType) return { line, label, status: 'error', message: `Type de contrat inconnu : ${v.employmentType}` };
    if (birthDate === undefined) return { line, label, status: 'error', message: `Date de naissance invalide (jj/mm/aaaa) : ${v.birthDate}` };
    if (hireDate === undefined) return { line, label, status: 'error', message: `Date de prise de fonction invalide (jj/mm/aaaa) : ${v.hireDate}` };
    if (!v.phone) return { line, label, status: 'error', message: 'Téléphone requis (il sert à la connexion).' };
    if (phone.error) return { line, label, status: 'error', message: phone.error };
    const parsed = staffSchema.safeParse({
      lastName: v.lastName ?? '',
      firstName: v.firstName ?? '',
      gender,
      employmentType,
      birthDate,
      birthPlace: '',
      functions,
      phone: phone.phone!,
      phone2: '',
      email: v.email ?? '',
      diploma: '',
      diplomaDetail: '',
      staffNumber: v.staffNumber ?? '',
      hireDate,
    });
    if (!parsed.success) return { line, label, status: 'error', message: zodMessage(parsed.error) };
    if (phones.has(phone.phone!)) return { line, label, status: 'skip', message: 'Déjà dans le personnel (même téléphone).' };
    if (parsed.data.staffNumber && numbers.has(loose(parsed.data.staffNumber))) {
      return { line, label, status: 'skip', message: 'Déjà dans le personnel (même matricule).' };
    }
    if (seen.has(phone.phone!)) return { line, label, status: 'skip', message: 'En double dans le fichier (même téléphone).' };
    seen.add(phone.phone!);
    return {
      line,
      label,
      status: 'ready',
      run: async () => {
        const result = await createStaff(ctx, parsed.data);
        return result.outcome === 'LINKED' ? 'Ce numéro avait déjà un accès : les fonctions lui ont été ajoutées.' : undefined;
      },
    } satisfies Plan;
  });
}

// ---------------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------------

/** Élèves déjà inscrits cette année : nom|prénoms|naissance. Lecture par curseur (1000 lignes par appel). */
async function enrolledKeys(ctx: TenantContext, supabase: Supabase, yearId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let after: string | null = null;
  for (;;) {
    let q = supabase
      .from('student_enrollments')
      .select('id, students(last_name, first_name, birth_date)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('id')
      .limit(1000);
    if (after) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as unknown as {
      id: string;
      students: { last_name: string; first_name: string; birth_date: string | null } | null;
    }[];
    for (const e of batch) {
      if (e.students) keys.add(`${loose(e.students.last_name)}|${loose(e.students.first_name)}|${e.students.birth_date ?? ''}`);
    }
    if (batch.length < 1000) break;
    after = batch[batch.length - 1]!.id;
  }
  return keys;
}

async function planStudents(ctx: TenantContext, supabase: Supabase, mapping: ColumnMapping, rows: ImportRow[]): Promise<Plan[]> {
  const year = ctx.academicYear;
  // Le matricule est exige ou non selon le reglage de l'etablissement.
  const matriculeRequired = matriculeIsRequired(await enrollmentPolicy(ctx));
  if (!year) return rows.map(({ line }) => ({ line, label: `Ligne ${line}`, status: 'error', message: 'Aucune année scolaire active.' }));
  const { data: classRows, error } = await supabase
    .from('classes')
    .select('id, code, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', year.id);
  if (error) throw error;
  const classes = new Map<string, string>();
  for (const c of classRows ?? []) {
    classes.set(loose(c.code), c.id);
    classes.set(loose(c.name), c.id);
  }
  const enrolled = await enrolledKeys(ctx, supabase, year.id);
  const seen = new Set<string>();

  return rows.map(({ line, cells }) => {
    const v = rowValues(mapping, cells);
    const label = [v.lastName?.toUpperCase(), v.firstName].filter(Boolean).join(' ') || `Ligne ${line}`;
    const gender = parseGender(v.gender ?? '');
    const birthDate = parseDate(v.birthDate ?? '');
    const classId = v.class ? classes.get(loose(v.class)) : undefined;
    const repeating = parseYesNo(v.repeating ?? '');
    const assigned = parseAssigned(v.stateAssigned ?? '');
    if (gender === undefined) return { line, label, status: 'error', message: `Sexe : M ou F attendu (${v.gender}).` };
    if (repeating === undefined) {
      return { line, label, status: 'error', message: `Redoublant : OUI ou NON attendu (${v.repeating}).` };
    }
    if (assigned === undefined) {
      return { line, label, status: 'error', message: `Statut : « Affecté » ou « Non affecté » attendu (${v.stateAssigned}).` };
    }
    if (birthDate === undefined) return { line, label, status: 'error', message: `Date de naissance invalide (jj/mm/aaaa) : ${v.birthDate}` };
    if (!classId) return { line, label, status: 'error', message: v.class ? `Classe inconnue cette année : ${v.class}` : 'Classe requise.' };

    const guardians: { firstName: string; lastName: string; phone: string; relationship: ReturnType<typeof parseRelationship>; isPrimaryContact: boolean }[] = [];
    if (v.guardian || v.guardianPhone) {
      const name = splitFullName(v.guardian ?? '');
      const phone = phoneCheck(ctx, v.guardianPhone ?? '', 'Téléphone du responsable');
      if (!v.guardianPhone) return { line, label, status: 'error', message: 'Téléphone du responsable requis avec son nom.' };
      if (phone.error) return { line, label, status: 'error', message: phone.error };
      if (!name.lastName) return { line, label, status: 'error', message: 'Nom du responsable requis avec son téléphone.' };
      guardians.push({
        lastName: name.lastName,
        // Prénoms absents : le nom sert aussi de prénom (le compte parent l'exige).
        firstName: name.firstName || name.lastName,
        phone: phone.phone!,
        relationship: parseRelationship(v.relationship ?? ''),
        isPrimaryContact: true,
      });
    }

    const parsed = enrollSchemaFor(matriculeRequired).safeParse({
      matricule: v.matricule ?? '',
      firstName: v.firstName ?? '',
      lastName: v.lastName ?? '',
      gender,
      birthDate,
      birthPlace: v.birthPlace ?? '',
      classId,
      isRepeating: repeating,
      isStateAssigned: assigned,
      lv2: v.lv2 ?? '',
      guardians,
    });
    if (!parsed.success) return { line, label, status: 'error', message: zodMessage(parsed.error) };
    const key = `${loose(parsed.data.lastName)}|${loose(parsed.data.firstName)}|${parsed.data.birthDate ?? ''}`;
    if (enrolled.has(key)) return { line, label, status: 'skip', message: 'Déjà inscrit cette année (même nom, prénoms et date de naissance).' };
    if (seen.has(key)) return { line, label, status: 'skip', message: 'En double dans le fichier.' };
    seen.add(key);
    const data = parsed.data;
    return {
      line,
      label,
      status: 'ready',
      run: async () => {
        requireWritable(ctx, 'students.create');
        const result = await enrollStudent(ctx, {
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender,
          birthDate: data.birthDate,
          birthPlace: data.birthPlace,
          matricule: data.matricule || null,
          classId: data.classId,
          isRepeating: data.isRepeating,
          isStateAssigned: data.isStateAssigned === '1',
          guardians: data.guardians,
        });
        if (data.lv2) {
          await assignLanguageGroup(ctx, year.id, {
            studentId: result.studentId,
            classId: data.classId,
            language: data.lv2,
          });
        }
        await audit(ctx, {
          action: 'students.enroll',
          module: 'students',
          entityType: 'student',
          entityId: result.studentId,
          after: { matricule: result.matricule, guardians: result.guardians.length, source: 'import' },
        });
        return data.lv2 ? `Matricule ${result.matricule}, LV2 ${data.lv2}.` : `Matricule ${result.matricule}.`;
      },
    } satisfies Plan;
  });
}

// ---------------------------------------------------------------------------
// Points d'entrée
// ---------------------------------------------------------------------------

const PLANNERS: Record<ImportKind, typeof planRooms> = {
  rooms: planRooms,
  classes: planClasses,
  teachers: planTeachers,
  staff: planStaff,
  students: planStudents,
};

async function plan(ctx: TenantContext, kind: ImportKind, header: string[], rows: ImportRow[]) {
  if (!canImport(ctx, kind)) throw new AuthorizationError(`Droit requis pour importer : ${IMPORT_KINDS[kind].label.toLowerCase()}.`);
  const mapping = mapColumns(kind, header);
  if (mapping.missingRequired.length > 0) {
    return { mapping, plans: [] as Plan[] };
  }
  const supabase = await createClient();
  return { mapping, plans: await PLANNERS[kind](ctx, supabase, mapping, rows) };
}

export async function previewImport(ctx: TenantContext, kind: ImportKind, header: string[], rows: ImportRow[]): Promise<ImportPreview> {
  const { mapping, plans } = await plan(ctx, kind, header, rows);
  const counts = { ready: 0, skip: 0, error: 0 };
  for (const p of plans) counts[p.status === 'ready' ? 'ready' : p.status === 'skip' ? 'skip' : 'error']++;
  return {
    matched: mapping.matched,
    ignored: mapping.ignored,
    missingRequired: mapping.missingRequired,
    counts,
    rows: plans.map(({ line, label, status, message }) => ({ line, label, status, ...(message ? { message } : {}) })),
  };
}

/** Crée les lignes prêtes d'un lot ; une erreur sur une ligne n'arrête pas les suivantes. */
export async function importRows(ctx: TenantContext, kind: ImportKind, header: string[], rows: ImportRow[]): Promise<RowOutcome[]> {
  const { mapping, plans } = await plan(ctx, kind, header, rows);
  if (mapping.missingRequired.length > 0) {
    return rows.map(({ line }) => ({ line, label: `Ligne ${line}`, status: 'error', message: `Colonnes manquantes : ${mapping.missingRequired.join(', ')}` }));
  }
  const out: RowOutcome[] = [];
  for (const p of plans) {
    if (p.status !== 'ready' || !p.run) {
      out.push({ line: p.line, label: p.label, status: p.status, ...(p.message ? { message: p.message } : {}) });
      continue;
    }
    try {
      const note = await p.run();
      const message = [p.message, note].filter(Boolean).join(' ');
      out.push({ line: p.line, label: p.label, status: 'created', ...(message ? { message } : {}) });
    } catch (error) {
      out.push({ line: p.line, label: p.label, status: 'error', message: reason(error) });
    }
  }
  return out;
}

/** Libellé de colonne comparable (pour les tests et l'aperçu). */
export const headerKey = normalizeHeader;
