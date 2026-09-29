import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { EducationTrack } from '@/features/structure/official-tracks';
import { periodsForTrack } from '@/features/academic-years/periods-by-track';

/** Données de référence pour les listes déroulantes des formulaires d'évaluation. */

export type Ref = { id: string; name: string };
/** Une période porte les ordres d'enseignement qu'elle concerne (null = toute l'école). */
export type PeriodRef = Ref & { tracks: string[] | null };
/** Une classe porte l'ordre de son niveau : c'est lui qui choisit trimestres ou semestres. */
export type ClassRef = Ref & { track: EducationTrack };

export async function listPeriods(ctx: TenantContext, yearId: string): Promise<PeriodRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, tracks: p.tracks ?? null }));
}

/**
 * Les périodes d'UNE classe : celles de son ordre d'enseignement. Un bulletin ne
 * mélange jamais deux ordres, et un professeur qui enseigne dans plusieurs ordres
 * voit, classe par classe, le bon découpage (trimestres ou semestres).
 */
export async function listPeriodsForClass(ctx: TenantContext, yearId: string, classId: string): Promise<PeriodRef[]> {
  const [periods, track] = await Promise.all([listPeriods(ctx, yearId), classTrack(ctx, classId)]);
  return periodsForTrack(periods, track);
}

/**
 * Le programme du niveau d'une classe : combien de matieres, pour quel total de
 * coefficients.
 *
 * Sans lui, la moyenne generale n'est pas calculable — elle est ponderee par les
 * coefficients de `level_subjects`. L'ecran doit le DIRE plutot que d'afficher
 * cinquante tirets, et le bulletin doit refuser plutot que d'imprimer du vide.
 */
export async function classProgramme(
  ctx: TenantContext,
  classId: string,
): Promise<{ subjects: number; totalCoefficient: number }> {
  const supabase = await createClient();
  const { data: klass } = await supabase
    .from('classes')
    .select('level_id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!klass?.level_id) return { subjects: 0, totalCoefficient: 0 };
  const { data } = await supabase
    .from('level_subjects')
    .select('coefficient')
    .eq('school_id', ctx.school.id)
    .eq('level_id', klass.level_id);
  const rows = (data ?? []) as { coefficient: number }[];
  return {
    subjects: rows.length,
    totalCoefficient: rows.reduce((a, r) => a + Number(r.coefficient), 0),
  };
}

/**
 * Les groupes qu'on peut noter, avec la classe qui donne leur découpage de
 * périodes (trimestres ou semestres selon l'ordre d'enseignement).
 */
export async function listGroupRefs(
  ctx: TenantContext,
  yearId: string,
): Promise<(Ref & { classId: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('groups')
    .select('id, name, group_classes(class_id)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('name');
  return ((data ?? []) as unknown as { id: string; name: string; group_classes: { class_id: string }[] }[]).map((g) => ({
    id: g.id,
    name: g.name,
    classId: g.group_classes[0]?.class_id ?? null,
  }));
}

/** Ordre d'enseignement d'une classe (niveau → cycle) ; général par défaut. */
export async function classTrack(ctx: TenantContext, classId: string): Promise<EducationTrack> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('level_id')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!data?.level_id) return 'GENERAL';
  const byLevel = await trackByLevel(ctx);
  return byLevel.get(data.level_id) ?? 'GENERAL';
}

const asTrack = (value: string | null | undefined): EducationTrack =>
  value === 'TECHNIQUE' || value === 'PROFESSIONNEL' ? value : 'GENERAL';

/**
 * Ordre de chaque niveau de l'établissement. Deux petites lectures valent mieux
 * qu'une jointure imbriquée ici : la table des niveaux tient en quelques lignes.
 */
async function trackByLevel(ctx: TenantContext): Promise<Map<string, EducationTrack>> {
  const supabase = await createClient();
  const [{ data: levels }, { data: cycles }] = await Promise.all([
    supabase.from('levels').select('id, cycle_id').eq('school_id', ctx.school.id),
    supabase.from('cycles').select('id, track').eq('school_id', ctx.school.id),
  ]);
  const cycleTrack = new Map((cycles ?? []).map((c) => [c.id, asTrack(c.track)]));
  return new Map((levels ?? []).map((l) => [l.id, cycleTrack.get(l.cycle_id) ?? 'GENERAL']));
}

export async function listClasses(ctx: TenantContext, yearId: string): Promise<ClassRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name, code, level_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('code');
  const byLevel = await trackByLevel(ctx);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, track: byLevel.get(c.level_id) ?? 'GENERAL' }));
}

export async function listSubjects(ctx: TenantContext): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as Ref[];
}

export async function listTeachers(ctx: TenantContext): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select('id, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null)
    .order('last_name');
  return ((data ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => ({
    id: t.id,
    name: `${t.last_name.toUpperCase()} ${t.first_name}`,
  }));
}
