import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { CycleInput, LevelInput } from './schemas';
import { OFFICIAL_STRUCTURE, type EducationTrack } from './official-tracks';
import { schoolTracks } from './queries';

export async function createCycle(ctx: TenantContext, input: CycleInput): Promise<void> {
  requireWritable(ctx, 'cycles.manage');
  // Un cycle ne peut appartenir qu'à un ordre choisi par l'établissement
  // (Paramètres → Identité de l'école) : c'est cet ordre qui décide ensuite du
  // découpage de ses classes (trimestres ou semestres) et de leurs congés.
  const tracks = await schoolTracks(ctx);
  if (tracks.length > 0 && !tracks.includes(input.track)) {
    throw new ValidationError(
      "Cet ordre d'enseignement n'est pas celui de votre établissement. Ajoutez-le d'abord dans Paramètres → Identité de l'école.",
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.from('cycles').insert({ school_id: ctx.school.id, ...input });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un cycle porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'cycles.create', module: 'structure', entityType: 'cycle', after: input });
}

export async function deleteCycle(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'cycles.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('cycles')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce cycle contient des niveaux.');
    throw error;
  }
  if (!count) throw new NotFoundError('Cycle introuvable.');
  await audit(ctx, { action: 'cycles.delete', module: 'structure', entityType: 'cycle', entityId: id });
}

export async function createLevel(ctx: TenantContext, input: LevelInput): Promise<void> {
  requireWritable(ctx, 'levels.manage');
  const supabase = await createClient();
  // Le cycle doit appartenir a l'etablissement (verifie par la RLS a l'insert,
  // mais on le controle explicitement pour un message clair).
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('id', input.cycleId)
    .maybeSingle();
  if (!cycle) throw new NotFoundError('Cycle introuvable.');

  const { error } = await supabase.from('levels').insert({
    school_id: ctx.school.id,
    cycle_id: input.cycleId,
    code: input.code,
    name: input.name,
    sequence: input.sequence,
    diploma: input.diploma || null,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un niveau porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'levels.create', module: 'structure', entityType: 'level', after: input });
}

export async function deleteLevel(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'levels.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('levels')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce niveau est utilisé (classes, programme).');
    throw error;
  }
  if (!count) throw new NotFoundError('Niveau introuvable.');
  await audit(ctx, { action: 'levels.delete', module: 'structure', entityType: 'level', entityId: id });
}

export type OfficialLevelsResult = { cycles: number; levels: number };

/**
 * Charge la structure officielle d'un ordre : ses cycles s'ils manquent, puis
 * ses niveaux absents.
 *
 * Le general en a DEUX (premier et second cycle) ; le technique et le
 * professionnel un seul. Tout cela est connu d'avance — une ecole qui vient de
 * s'inscrire n'a pas a saisir « 6eme », « 5eme », « 4eme »… ni a inventer le
 * nom de ses cycles.
 *
 * Rejouable : rien n'est renomme ni supprime, un cycle ou un niveau deja
 * present (meme code) est laisse tel quel.
 */
export async function applyOfficialLevels(ctx: TenantContext, track: EducationTrack): Promise<OfficialLevelsResult> {
  requireWritable(ctx, 'cycles.manage');
  requireWritable(ctx, 'levels.manage');

  const tracks = await schoolTracks(ctx);
  if (!tracks.includes(track)) {
    throw new ValidationError(
      "Cet ordre d'enseignement n'est pas celui de votre établissement. Ajoutez-le d'abord dans Paramètres → Identité de l'école.",
    );
  }

  const official = OFFICIAL_STRUCTURE[track];
  const supabase = await createClient();

  const { data: cycles, error: cycleError } = await supabase
    .from('cycles')
    .select('id, code, track')
    .eq('school_id', ctx.school.id);
  if (cycleError) throw cycleError;

  // Les cycles deja la, par code : on ne recree jamais ce qui existe.
  const parCode = new Map((cycles ?? []).map((c) => [c.code, c.id]));
  const aCreer = official.cycles.filter((c) => !parCode.has(c.code));

  if (aCreer.length > 0) {
    const depart = (cycles ?? []).length;
    const { data, error } = await supabase
      .from('cycles')
      .insert(
        aCreer.map((c, i) => ({
          school_id: ctx.school.id,
          code: c.code,
          name: c.name,
          track,
          sequence: depart + i + 1,
        })),
      )
      .select('id, code');
    if (error) throw error;
    for (const c of data ?? []) parCode.set(c.code, c.id);
  }

  const { data: existing, error: levelError } = await supabase.from('levels').select('code').eq('school_id', ctx.school.id);
  if (levelError) throw levelError;
  const taken = new Set((existing ?? []).map((l) => l.code));
  const missing = official.levels.filter((l) => !taken.has(l.code) && parCode.has(l.cycleCode));

  if (missing.length > 0) {
    const { error } = await supabase.from('levels').insert(
      missing.map((l) => ({
        school_id: ctx.school.id,
        cycle_id: parCode.get(l.cycleCode)!,
        code: l.code,
        name: l.name,
        diploma: l.diploma,
        sequence: l.sequence,
      })),
    );
    if (error) throw error;
  }

  await audit(ctx, {
    action: 'structure.official_levels',
    module: 'structure',
    entityType: 'cycle',
    entityId: parCode.get(official.cycles[0]!.code) ?? null,
    after: { track, cycles: aCreer.length, levels: missing.length },
  });
  return { cycles: aCreer.length, levels: missing.length };
}
