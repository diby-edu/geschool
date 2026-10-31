import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type AbsenceRow = {
  id: string;
  date: string;
  student: string;
  matricule: string;
  klass: string;
  subject: string;
  status: string;
  minutes_late: number;
  comment: string | null;
};

export const ABSENCES_PAGE_SIZE = 100;

/**
 * Absences et retards sur une fenêtre de dates, UNE page à la fois (les plus
 * récentes d'abord), avec le total. La date de référence est celle du cours.
 *
 * Tout se fait en base (list_absences, 0134) : lire toutes les absences du mois
 * pour les afficher d'un bloc prenait 104 s sur un grand établissement (20 000
 * absences et retards en un mois), et une lecture simple s'arrêtait sans le
 * dire à 1 000 lignes.
 */
export async function listAbsences(
  ctx: TenantContext,
  opts: {
    from: string;
    to: string;
    page?: number;
    /** Filtres et tri de la liste (absences_page, 0163). */
    level?: string | undefined;
    classId?: string | undefined;
    kind?: 'ABSENT' | 'LATE' | undefined;
    q?: string | undefined;
    sort?: 'date' | 'classe' | 'eleve' | undefined;
  },
): Promise<{ rows: AbsenceRow[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, opts.page ?? 1);
  const paging = { p_school: ctx.school.id, p_from: opts.from, p_to: opts.to, p_limit: ABSENCES_PAGE_SIZE, p_offset: (page - 1) * ABSENCES_PAGE_SIZE };
  let { data, error } = await supabase.rpc('absences_page' as never, {
    ...paging,
    p_level: opts.level || null,
    p_class: opts.classId || null,
    p_kind: opts.kind ?? null,
    p_q: opts.q || null,
    p_sort: opts.sort ?? 'date',
  } as never);
  // Avant la migration 0163 : l'ancienne liste, sans les filtres.
  if (error && (error.code === 'PGRST202' || error.code === '42883')) {
    ({ data, error } = await supabase.rpc('list_absences' as never, paging as never));
  }
  if (error) throw error;
  const list = (data ?? []) as {
    id: string;
    occurs_on: string;
    student: string;
    matricule: string;
    class_name: string | null;
    subject: string;
    status: string;
    minutes_late: number;
    comment: string | null;
    total: number | string;
  }[];
  return {
    total: list.length ? Number(list[0]!.total) : 0,
    rows: list.map((r) => ({
      id: r.id,
      date: r.occurs_on,
      student: r.student,
      matricule: r.matricule,
      klass: r.class_name ?? '—',
      subject: r.subject,
      status: r.status,
      minutes_late: r.minutes_late,
      comment: r.comment,
    })),
  };
}
