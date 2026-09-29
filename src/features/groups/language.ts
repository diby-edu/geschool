import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';

/**
 * La langue vivante 2 déclarée à l'inscription, et le groupe qui va avec.
 *
 * La langue n'est PAS une colonne de l'élève : ce serait figer « LV2 » dans le
 * code, et une école qui ouvre une option d'arts ou un groupe de soutien serait
 * coincée. C'est une appartenance à un groupe de type « Langue » — le mécanisme
 * générique, que l'emploi du temps sait déjà faire sortir de la classe.
 *
 * Le groupe est trouvé, ou créé s'il n'existe pas encore : personne ne saisit
 * deux fois la même liste. Un groupe créé ainsi n'a pas de matière ; l'école la
 * précise une fois depuis l'écran des groupes, et tous les élèves suivants s'y
 * rangent sans rien redemander.
 */

/** Deux écritures d'une même langue (« ESPAGNOL », « Espagnol ») sont la même. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Les langues déjà connues de l'établissement cette année. */
export async function listLanguages(ctx: TenantContext, yearId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('groups')
    .select('name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('kind', 'LANGUAGE')
    .eq('status', 'ACTIVE');
  const seen = new Map<string, string>();
  for (const g of (data ?? []) as { name: string }[]) {
    if (!seen.has(normalize(g.name))) seen.set(normalize(g.name), g.name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Un code court, stable et lisible, dérivé du nom de la langue. */
function codeFor(language: string): string {
  const base = normalize(language).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  return `LV2-${base || 'LANGUE'}`.slice(0, 30);
}

/**
 * Range l'élève dans le groupe de sa langue, en créant ce qu'il faut.
 *
 * Écrit avec le client ordinaire : les règles de la base s'appliquent, donc
 * l'utilisateur doit détenir les droits sur les groupes. L'inscription elle-même
 * n'échoue jamais pour autant — l'appelant décide quoi faire du message.
 */
export async function assignLanguageGroup(
  ctx: TenantContext,
  yearId: string,
  input: { studentId: string; classId: string; language: string },
): Promise<{ groupId: string; created: boolean }> {
  const supabase = await createClient();
  const wanted = normalize(input.language);

  const { data: existing } = await supabase
    .from('groups')
    .select('id, name, group_classes(class_id)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('kind', 'LANGUAGE');

  const rows = (existing ?? []) as unknown as { id: string; name: string; group_classes: { class_id: string }[] }[];
  const match = rows.find((g) => normalize(g.name) === wanted);

  let groupId: string;
  let created = false;

  if (match) {
    groupId = match.id;
    // Le groupe existe mais ne couvre pas encore cette classe : on l'y rattache,
    // sinon l'élève ne pourrait pas y entrer.
    if (!match.group_classes.some((c) => c.class_id === input.classId)) {
      const { error } = await supabase
        .from('group_classes')
        .insert({ school_id: ctx.school.id, group_id: groupId, class_id: input.classId });
      if (error && error.code !== '23505') throw error;
    }
  } else {
    const { data: fresh, error } = await supabase
      .from('groups')
      .insert({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        code: codeFor(input.language),
        name: input.language.trim(),
        kind: 'LANGUAGE',
        status: 'ACTIVE',
      })
      .select('id')
      .single();
    if (error) throw error;
    groupId = fresh.id;
    created = true;
    const { error: linkError } = await supabase
      .from('group_classes')
      .insert({ school_id: ctx.school.id, group_id: groupId, class_id: input.classId });
    if (linkError && linkError.code !== '23505') throw linkError;
    await audit(ctx, {
      action: 'groups.create',
      module: 'groups',
      entityType: 'group',
      entityId: groupId,
      after: { name: input.language.trim(), kind: 'LANGUAGE', source: 'inscription' },
    });
  }

  const { error: memberError } = await supabase.from('student_groups').insert({
    school_id: ctx.school.id,
    group_id: groupId,
    student_id: input.studentId,
    academic_year_id: yearId,
  });
  if (memberError && memberError.code !== '23505') throw memberError;

  return { groupId, created };
}
