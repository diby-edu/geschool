import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { buildCsv, csvCell, csvPhone, frenchDate } from '@/lib/csv';
import { diplomaLabel, employmentLabel } from '@/lib/hr';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { listStaff } from '@/features/staff/queries';
import { loadTeacherContacts } from '@/features/teachers/contacts';
import { IMPORT_KINDS, type ImportKind } from './kinds';

/**
 * Exports CSV (Excel français : `;`, UTF-8 avec BOM, lib/csv.ts) des listes
 * importables. Les en-têtes sont EXACTEMENT ceux du modèle d'import : un fichier
 * exporté, corrigé dans Excel, se réimporte tel quel (ce qui existe déjà est
 * alors ignoré). Les élèves ont leur propre export (features/students/export.ts),
 * aux mêmes en-têtes.
 */

const header = (kind: ImportKind) => IMPORT_KINDS[kind].columns.map((c) => c.label);
const yesNo = (v: boolean | null | undefined) => (v ? 'Oui' : 'Non');
const GENDER: Record<string, string> = { M: 'M', F: 'F' };
const TEACHER_STATUS: Record<string, string> = { ACTIVE: 'Actif', ON_LEAVE: 'En congé', SUSPENDED: 'Suspendu', LEFT: 'Parti' };

/** Lecture complète par pages de 1000 (plafond de l'API), triée par identifiant. */
async function readAll<T extends { id: string }>(
  fetchPage: (after: string | null) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await fetchPage(after);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1]!.id;
  }
  return out;
}

async function roomsCsv(ctx: TenantContext): Promise<{ csv: string; count: number }> {
  const supabase = await createClient();
  type Row = { id: string; code: string; name: string; capacity: number; building: string | null; floor: string | null; is_active: boolean; room_types: { name: string } | null };
  const rows = await readAll<Row>((after) => {
    let q = supabase
      .from('rooms')
      .select('id, code, name, capacity, building, floor, is_active, room_types(name)')
      .eq('school_id', ctx.school.id)
      .order('id')
      .limit(1000);
    if (after) q = q.gt('id', after);
    return q;
  });
  rows.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  const lines = rows.map((r) =>
    [r.code, r.name, r.room_types?.name ?? '', String(r.capacity), r.building ?? '', r.floor ?? '', yesNo(r.is_active)].map(csvCell),
  );
  return { csv: buildCsv(header('rooms'), lines), count: rows.length };
}

async function classesCsv(ctx: TenantContext): Promise<{ csv: string; count: number }> {
  if (!ctx.academicYear) return { csv: buildCsv(header('classes'), []), count: 0 };
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;
  type Row = { id: string; code: string; name: string; capacity: number; levels: { name: string; sequence: number } | null; teachers: { staff_number: string } | null; rooms: { code: string } | null };
  const rows = await readAll<Row>((after) => {
    let q = supabase
      .from('classes')
      .select('id, code, name, capacity, levels(name, sequence), teachers(staff_number), rooms(code)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('id')
      .limit(1000);
    if (after) q = q.gt('id', after);
    return q;
  });
  rows.sort((a, b) => (a.levels?.sequence ?? 0) - (b.levels?.sequence ?? 0) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
  const lines = rows.map((r) =>
    [r.code, r.name, r.levels?.name ?? '', String(r.capacity), r.teachers?.staff_number ?? '', r.rooms?.code ?? ''].map(csvCell),
  );
  return { csv: buildCsv(header('classes'), lines), count: rows.length };
}

async function teachersCsv(ctx: TenantContext): Promise<{ csv: string; count: number }> {
  const supabase = await createClient();
  type Row = {
    id: string; staff_number: string; last_name: string; first_name: string; gender: string | null;
    specialty: string | null; employment_type: string | null; status: string; diploma: string | null; hire_date: string | null;
  };
  const rows = await readAll<Row>((after) => {
    let q = supabase
      .from('teachers')
      .select('id, staff_number, last_name, first_name, gender, specialty, employment_type, status, diploma, hire_date')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .order('id')
      .limit(1000);
    if (after) q = q.gt('id', after);
    return q;
  });
  rows.sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr') || a.first_name.localeCompare(b.first_name, 'fr'));
  // Coordonnées : « Voir les enseignants » (teacher_contacts, 0059).
  const contacts = await loadTeacherContacts(ctx, rows.map((t) => t.id));
  const lines = rows.map((t) => [
    csvCell(t.staff_number),
    csvCell(t.last_name.toUpperCase()),
    csvCell(t.first_name),
    csvCell(t.gender ? (GENDER[t.gender] ?? '') : ''),
    csvCell(frenchDate(contacts.get(t.id)?.birth_date ?? null)),
    csvPhone(contacts.get(t.id)?.phone_e164 ?? null),
    csvCell(contacts.get(t.id)?.email ?? null),
    csvCell(t.specialty),
    csvCell(t.employment_type ? employmentLabel(t.employment_type) : ''),
    csvCell(TEACHER_STATUS[t.status] ?? t.status),
    csvCell(t.diploma ? diplomaLabel(t.diploma) : ''),
    csvCell(frenchDate(t.hire_date)),
  ]);
  return { csv: buildCsv(header('teachers'), lines), count: rows.length };
}

async function staffCsv(ctx: TenantContext): Promise<{ csv: string; count: number }> {
  const staff = await listStaff(ctx);
  const lines = staff.map((s) => [
    csvCell(s.lastName.toUpperCase()),
    csvCell(s.firstName),
    csvCell(s.gender ? (GENDER[s.gender] ?? '') : ''),
    csvCell(s.functions.map((f) => roleLabel(f.code as RoleCode)).join(', ')),
    s.loginKind === 'PHONE' || s.identifier?.startsWith('+') ? csvPhone(s.identifier) : csvCell(''),
    csvCell(s.email ?? (s.identifier?.includes('@') ? s.identifier : '')),
    csvCell(s.employmentType ? employmentLabel(s.employmentType) : ''),
    csvCell(s.staffNumber),
    csvCell(frenchDate(s.birthDate)),
    csvCell(frenchDate(s.hireDate)),
  ]);
  return { csv: buildCsv(header('staff'), lines), count: staff.length };
}

export const EXPORTERS: Record<Exclude<ImportKind, 'students'>, (ctx: TenantContext) => Promise<{ csv: string; count: number }>> = {
  rooms: roomsCsv,
  classes: classesCsv,
  teachers: teachersCsv,
  staff: staffCsv,
};

/** Droit requis pour exporter une liste (lecture de la liste ; élèves : droit d'export dédié). */
export const EXPORT_PERMISSION: Record<ImportKind, string> = {
  rooms: 'rooms.view',
  classes: 'classes.view',
  teachers: 'teachers.view',
  staff: 'users.view',
  students: 'students.export',
};

export const EXPORT_FILE: Record<ImportKind, string> = {
  rooms: 'salles',
  classes: 'classes',
  teachers: 'enseignants',
  staff: 'personnel',
  students: 'eleves',
};
