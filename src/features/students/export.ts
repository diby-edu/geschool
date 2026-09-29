import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { buildCsv, csvCell, csvPhone, frenchDate } from '@/lib/csv';
import { STUDENT_EXPORT_HEADER } from './export-columns';

/**
 * Export des élèves inscrits (année active) au format CSV.
 *
 * Contenu : identité, classe et responsable principal (nom, lien, téléphone).
 * Jamais : notes médicales, observations, adresse — ce qui relève de
 * `students.view_sensitive`.
 *
 * Lecture par la fonction `public.export_students` (migration 0052) : elle vérifie
 * UNE fois le droit `students.export`, puis lit en bloc. Lue sous RLS, la même
 * requête évalue les règles ligne par ligne (5 s pour 800 élèves, environ 35 s pour
 * 5 600). Lecture PAR CURSEUR sur l'identifiant de l'inscription, jamais par
 * décalage : sans clé de tri unique, des lignes changent de page d'un appel à
 * l'autre et se perdent ou se dupliquent. Un lot = 1000 lignes (plafond de l'API).
 */

const BATCH = 1000;
const HEADER = [...STUDENT_EXPORT_HEADER];

type ExportRow = {
  enrollment_id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  class_name: string | null;
  is_state_assigned: boolean | null;
  is_repeating: boolean;
  guardian_last_name: string | null;
  guardian_first_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
};

/** Mots de la recherche, réduits à ce qui peut figurer dans un nom ou un matricule. */
function searchTerms(raw: string): string[] {
  return raw
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, '').slice(0, 40))
    .filter(Boolean)
    .slice(0, 4);
}

const GENDER: Record<string, string> = { M: 'M', F: 'F' };

export async function buildStudentsCsv(
  ctx: TenantContext,
  yearId: string,
  q: string,
): Promise<{ csv: string; count: number }> {
  const supabase = await createClient();
  const terms = searchTerms(q);
  const rows: string[][] = [];
  let last: string | null = null;

  for (;;) {
    const { data, error } = await supabase.rpc(
      'export_students' as never,
      { p_school: ctx.school.id, p_year: yearId, p_terms: terms, p_after: last, p_limit: BATCH } as never,
    );
    if (error) throw error;
    const batch = (data ?? []) as unknown as ExportRow[];

    for (const s of batch) {
      const guardian = s.guardian_last_name
        ? `${s.guardian_last_name.toUpperCase()} ${s.guardian_first_name ?? ''}`.trim()
        : '';
      rows.push([
        csvCell(s.matricule),
        csvCell(s.last_name.toUpperCase()),
        csvCell(s.first_name),
        csvCell(s.gender ? (GENDER[s.gender] ?? '') : ''),
        csvCell(frenchDate(s.birth_date)),
        csvCell(s.birth_place),
        csvCell(s.class_name),
        csvCell(s.is_state_assigned === null ? '' : s.is_state_assigned ? 'Affecté' : 'Non affecté'),
        csvCell(s.is_repeating ? 'OUI' : 'NON'),
        csvCell(guardian),
        csvCell(s.guardian_relation),
        csvPhone(s.guardian_phone),
      ]);
    }

    if (batch.length < BATCH) break;
    last = batch[batch.length - 1]!.enrollment_id;
  }

  // Tri final par classe puis nom : un fichier lisible tel quel.
  rows.sort((a, b) => (a[6] ?? '').localeCompare(b[6] ?? '', 'fr') || (a[1] ?? '').localeCompare(b[1] ?? '', 'fr'));
  return { csv: buildCsv(HEADER, rows), count: rows.length };
}
