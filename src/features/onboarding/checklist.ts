import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Ce qu'il reste a faire pour que l'etablissement fonctionne.
 *
 * Une ecole qui vient de s'inscrire tombe sur des ecrans qui se bloquent les
 * uns les autres : pas d'annee scolaire, donc pas de classes ; pas de niveaux,
 * donc pas de classes non plus ; pas de periodes, donc pas de notes. Chacun le
 * dit a sa facon, aucun ne dit par ou commencer.
 *
 * Cette liste le dit. Elle est COURTE et s'arrete la : ce n'est pas un
 * parcours oblige, on la quitte et on y revient. Elle s'efface toute seule
 * quand tout est pret.
 */

export type Step = {
  id: string;
  label: string;
  /** Pourquoi c'est necessaire, en une phrase. */
  why: string;
  done: boolean;
  /** Sans elle, les suivantes ne servent a rien. */
  blocking: boolean;
  href: string;
  /** Verbe du bouton quand l'etape reste a faire. */
  cta: string;
};

export type Checklist = { steps: Step[]; done: number; total: number; ready: boolean };

export async function readChecklist(ctx: TenantContext): Promise<Checklist> {
  const supabase = await createClient();
  const base = `/e/${ctx.school.slug}`;
  const suite = '?suite=demarrage';

  // L'annee EN COURS, sinon celle qui existe sans avoir ete activee : une
  // annee creee mais endormie ne doit pas faire croire que tout est a refaire.
  const { data: annees } = await supabase
    .from('academic_years')
    .select('id, name, is_current')
    .eq('school_id', ctx.school.id)
    .order('starts_on', { ascending: false });
  const toutes = (annees ?? []) as { id: string; name: string; is_current: boolean }[];
  const active = toutes.find((y) => y.is_current) ?? null;
  const dormante = active ? null : (toutes[0] ?? null);
  const yearId = active?.id ?? dormante?.id ?? null;

  const compte = (table: 'levels' | 'classes' | 'subjects' | 'teachers' | 'students' | 'grading_scales' | 'staff_profiles') =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.school.id);

  const [levels, classes, subjects, teachers, students, periods, scales, staff, horaires] = await Promise.all([
    compte('levels'),
    yearId
      ? supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
      : compte('classes'),
    compte('subjects'),
    compte('teachers').is('deleted_at', null),
    compte('students').is('deleted_at', null),
    yearId
      ? supabase
          .from('academic_periods')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
      : Promise.resolve({ count: 0, error: null }),
    compte('grading_scales'),
    compte('staff_profiles'),
    yearId
      ? supabase
          .from('schedule_configurations')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  // Un comptage en echec n'est pas un comptage a zero : on ne declare pas une
  // etape « a faire » parce que la base n'a pas repondu.
  const fait = (r: { count: number | null; error: unknown }) => (r.error ? true : (r.count ?? 0) > 0);

  const steps: Step[] = [
    {
      id: 'year',
      label: 'L’année scolaire',
      why: dormante
        ? `« ${dormante.name} » est créée mais pas encore active : rien ne s’y rattache tant qu’elle dort.`
        : 'Tout s’y rattache : classes, emploi du temps, notes, bulletins.',
      done: active !== null,
      blocking: true,
      href: dormante ? `${base}/academic-years${suite}` : `${base}/academic-years/new${suite}`,
      cta: dormante ? 'Activer l’année' : 'Choisir l’année',
    },
    {
      id: 'periods',
      label: 'Les trimestres ou semestres',
      why: 'Sans période, aucune note ne peut être saisie ni moyenne calculée.',
      done: fait(periods as { count: number | null; error: unknown }),
      blocking: true,
      href: yearId ? `${base}/academic-years/${yearId}?onglet=trimestres` : `${base}/academic-years${suite}`,
      cta: 'Définir les périodes',
    },
    {
      id: 'structure',
      label: 'Les cycles et les niveaux',
      why: 'Les classes se créent à partir des niveaux. Ceux de votre ordre sont déjà prêts.',
      done: fait(levels),
      blocking: true,
      href: `${base}/structure${suite}`,
      cta: 'Charger la structure',
    },
    {
      id: 'classes',
      label: 'Les classes',
      why: 'C’est là qu’on inscrit les élèves et qu’on place les cours.',
      done: fait(classes),
      blocking: true,
      href: `${base}/classes/new${suite}`,
      cta: 'Créer une classe',
    },
    {
      id: 'hours',
      label: 'Les horaires de la journée',
      why: 'Début et fin de chaque jour, récréations, durée d’un cours : la grille où se placent les séances.',
      done: fait(horaires as { count: number | null; error: unknown }),
      blocking: true,
      href: yearId ? `${base}/academic-years/${yearId}?onglet=horaires` : `${base}/academic-years${suite}`,
      cta: 'Régler les horaires',
    },
    {
      id: 'subjects',
      label: 'Les matières',
      why: 'Avec leurs coefficients par niveau : ils pèsent les moyennes.',
      done: fait(subjects),
      blocking: false,
      href: `${base}/subjects${suite}`,
      cta: 'Ajouter les matières',
    },
    {
      id: 'grading',
      label: 'Le barème de notation',
      why: 'Sur combien on note, à partir de quand c’est réussi.',
      done: fait(scales),
      blocking: false,
      href: `${base}/evaluations/config${suite}`,
      cta: 'Régler la notation',
    },
    {
      id: 'teachers',
      label: 'Les enseignants',
      why: 'Pour leur affecter des classes et leur ouvrir l’appel.',
      done: fait(teachers),
      blocking: false,
      href: `${base}/teachers/new${suite}`,
      cta: 'Ajouter un enseignant',
    },
    {
      id: 'staff',
      label: 'Le personnel et ses droits',
      why: 'Censeur, éducateur, secrétaire… Chaque fonction ouvre ce qu’elle doit voir, et rien d’autre.',
      done: fait(staff),
      blocking: false,
      href: `${base}/personnel/new${suite}`,
      cta: 'Ajouter du personnel',
    },
    {
      id: 'students',
      label: 'Les élèves',
      why: 'Un par un, ou tous ensemble depuis un fichier Excel.',
      done: fait(students),
      blocking: false,
      href: `${base}/students/new${suite}`,
      cta: 'Inscrire un élève',
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, ready: done === steps.length };
}
