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
 * parcours oblige, on la quitte et on y revient. Ce qui est fait disparait de
 * la barre de progression, et l'ecran s'efface tout seul quand tout est pret.
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
  const yearId = ctx.academicYear?.id ?? null;

  // Un simple « y en a-t-il ? » : on compte sans ramener les lignes.
  const compte = (table: 'levels' | 'classes' | 'subjects' | 'teachers' | 'students' | 'grading_scales') =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.school.id);

  const [levels, classes, subjects, teachers, students, periods, scales] = await Promise.all([
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
  ]);

  // Un comptage en echec n'est pas un comptage a zero : on ne declare pas une
  // etape « a faire » parce que la base n'a pas repondu.
  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : (r.count ?? 0));
  const fait = (r: { count: number | null; error: unknown }) => (n(r) ?? 1) > 0;

  const steps: Step[] = [
    {
      id: 'year',
      label: 'L’année scolaire',
      why: 'Tout s’y rattache : classes, emploi du temps, notes, bulletins.',
      done: yearId !== null,
      blocking: true,
      href: `${base}/academic-years/new`,
      cta: 'Choisir l’année',
    },
    {
      id: 'periods',
      label: 'Les trimestres ou semestres',
      why: 'Sans période, aucune note ne peut être saisie ni moyenne calculée.',
      done: fait(periods as { count: number | null; error: unknown }),
      blocking: true,
      href: yearId ? `${base}/academic-years/${yearId}?onglet=trimestres` : `${base}/academic-years`,
      cta: 'Définir les périodes',
    },
    {
      id: 'structure',
      label: 'Les cycles et les niveaux',
      why: 'Les classes se créent à partir des niveaux. Ceux de votre ordre sont déjà prêts.',
      done: fait(levels),
      blocking: true,
      href: `${base}/structure`,
      cta: 'Charger la structure',
    },
    {
      id: 'classes',
      label: 'Les classes',
      why: 'C’est là qu’on inscrit les élèves et qu’on place les cours.',
      done: fait(classes),
      blocking: true,
      href: `${base}/classes/new`,
      cta: 'Créer une classe',
    },
    {
      id: 'subjects',
      label: 'Les matières',
      why: 'Avec leurs coefficients par niveau : ils pèsent les moyennes.',
      done: fait(subjects),
      blocking: false,
      href: `${base}/subjects`,
      cta: 'Ajouter les matières',
    },
    {
      id: 'grading',
      label: 'Le barème de notation',
      why: 'Sur combien on note, à partir de quand c’est réussi.',
      done: fait(scales),
      blocking: false,
      href: `${base}/evaluations/config`,
      cta: 'Régler la notation',
    },
    {
      id: 'teachers',
      label: 'Les enseignants',
      why: 'Pour leur affecter des classes et leur ouvrir l’appel.',
      done: fait(teachers),
      blocking: false,
      href: `${base}/teachers/new`,
      cta: 'Ajouter un enseignant',
    },
    {
      id: 'students',
      label: 'Les élèves',
      why: 'Un par un, ou tous ensemble depuis un fichier Excel.',
      done: fait(students),
      blocking: false,
      href: `${base}/students/new`,
      cta: 'Inscrire un élève',
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, ready: done === steps.length };
}
