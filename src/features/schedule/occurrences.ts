import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { TablesInsert } from '@/types/database';

/**
 * Materialise les occurrences datees d'une version publiee (ADR-002) : la trame
 * hebdomadaire est projetee sur le calendrier scolaire, jours de vacances et
 * feries exclus. L'appel et les absences (lot 9) s'attacheront a ces occurrences.
 *
 * Fenetre bornee (12 semaines depuis le debut de l'annee) : sur un vCPU unique
 * (ADR-014), on evite d'inserer des dizaines de milliers de lignes en une
 * requete. La generation de l'annee complete deviendra un job de fond (lot 9) ;
 * cette fenetre suffit a alimenter l'appel du trimestre en cours.
 */
export async function materializeOccurrences(
  ctx: TenantContext,
  versionId: string,
  yearId: string,
): Promise<number> {
  const supabase = await createClient();

  const { data: year } = await supabase
    .from('academic_years')
    .select('starts_on, ends_on')
    .eq('school_id', ctx.school.id)
    .eq('id', yearId)
    .maybeSingle();
  if (!year) return 0;

  const start = new Date(`${year.starts_on}T00:00:00Z`);
  const hardEnd = new Date(`${year.ends_on}T00:00:00Z`);
  const windowEnd = new Date(start.getTime() + 12 * 7 * 24 * 3600_000);
  const end = windowEnd < hardEnd ? windowEnd : hardEnd;

  // Jours bloques (vacances, feries)
  const { data: blocks } = await supabase
    .from('school_calendar_events')
    .select('starts_on, ends_on')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('blocks_schedule', true);
  const blocked = (d: Date): boolean => {
    const iso = d.toISOString().slice(0, 10);
    return (blocks ?? []).some((b) => iso >= b.starts_on && iso <= b.ends_on);
  };

  // Seances de la version (paginee : un grand etablissement peut depasser le
  // plafond de lignes par reponse de PostgREST — et la policy RLS de
  // schedule_sessions est assez couteuse par ligne pour qu'une page de 1000
  // risque le statement_timeout a elle seule, cf. lib/supabase/pagination).
  const sessions = await fetchAllRows(
    (from, to) =>
      supabase
        .from('schedule_sessions')
        .select('id, day_of_week, starts_at, ends_at')
        .eq('school_id', ctx.school.id)
        .eq('schedule_version_id', versionId)
        .order('id')
        .range(from, to),
    500,
  );
  if (sessions.length === 0) return 0;

  const byDay = new Map<number, typeof sessions>();
  for (const s of sessions) {
    const list = byDay.get(s.day_of_week) ?? [];
    list.push(s);
    byDay.set(s.day_of_week, list);
  }

  // Occurrences precedentes de la version : on repart proprement (les
  // occurrences passees d'une AUTRE version publiee sont conservees ailleurs)
  await supabase.from('session_occurrences').delete().eq('school_id', ctx.school.id).in(
    'schedule_session_id',
    sessions.map((s) => s.id),
  );

  const rows: TablesInsert<'session_occurrences'>[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 3600_000)) {
    const isoDay = ((d.getUTCDay() + 6) % 7) + 1; // JS 0=dim -> ISO 1=lun..7=dim
    if (blocked(d)) continue;
    const daySessions = byDay.get(isoDay);
    if (!daySessions) continue;
    const date = d.toISOString().slice(0, 10);
    for (const s of daySessions) {
      rows.push({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        schedule_session_id: s.id,
        occurs_on: date,
        // Horaires en heure locale de l'etablissement (murale). Le decalage fin
        // sera affine si necessaire ; suffisant pour grouper par date/creneau.
        starts_at: `${date}T${s.starts_at}+00`,
        ends_at: `${date}T${s.ends_at}+00`,
        status: 'SCHEDULED',
      });
    }
  }

  // Insertion par lots pour ne pas saturer une requete
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('session_occurrences').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rows.length;
}
