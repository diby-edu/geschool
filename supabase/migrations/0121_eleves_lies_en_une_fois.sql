-- =============================================================================
-- 0121 — Droits sur les élèves : calculés UNE fois par requête, plus par ligne
-- =============================================================================
-- Les règles de lecture des élèves, inscriptions, présences, justificatifs,
-- notes, bulletins… appelaient app.can_see_student(école, élève) pour CHAQUE
-- ligne. Chaque appel refait jusqu'à cinq recherches (droit, parent, élève,
-- enseignant de la classe, du groupe, professeur principal). Mesuré le
-- 2026-10-16 sur l'école de démo (4 000 élèves, 125 000 présences) :
--   - parent : 19 s pour lire SES élèves, délai dépassé sur les présences ;
--   - « Mes notes » du parent : 47 s, moyennes affichées « — ».
--
-- Même règle, posée autrement : la liste des élèves LIÉS à la personne (ses
-- enfants, elle-même, les élèves de ses classes et groupes, ceux de sa classe
-- de professeur principal) est calculée une fois, et chaque ligne est
-- comparée à cette liste (recherche dans une table de hachage).
--
--   ancien : app.can_see_student(S, E)
--   nouveau : (SELECT app.is_platform_admin())
--             OR S IN (SELECT app.my_schools_with('students.view'))
--             OR E IN (SELECT app.my_linked_students())
--
-- Équivalence : can_see_student = administrateur plateforme, OU membre actif
-- avec « students.view » (exactement my_schools_with), OU parent / élève /
-- enseignant de l'élève — chacun réservé, ici, aux écoles dont la personne est
-- membre actif (0120 l'impose déjà à can_see_student).
-- can_see_student reste disponible pour les fonctions qui l'appellent.
-- =============================================================================

create or replace function app.my_linked_students()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with ms as (
    select m.school_id from public.school_memberships m
    where m.user_id = auth.uid() and m.status = 'ACTIVE'
  ),
  me as (
    select t.id, t.school_id from public.teachers t
    where t.user_id = auth.uid() and t.deleted_at is null
      and t.school_id in (select school_id from ms)
  )
  -- Ses enfants (parent ou tuteur actif)
  select sg.student_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where g.user_id = auth.uid() and g.status = 'ACTIVE'
    and sg.school_id in (select school_id from ms)
  union
  -- Lui-même (élève avec un compte)
  select s.id from public.students s
  where s.user_id = auth.uid() and s.deleted_at is null
    and s.school_id in (select school_id from ms)
  union
  -- Les élèves de ses classes
  select se.student_id
  from public.teaching_assignments ta
  join me on me.id = ta.teacher_id
  join public.student_enrollments se
    on se.class_id = ta.class_id and se.academic_year_id = ta.academic_year_id
  where ta.status = 'ACTIVE' and se.status = 'ENROLLED'
  union
  -- Les élèves de ses groupes (LV2, options)
  select sgr.student_id
  from public.teaching_assignments ta
  join me on me.id = ta.teacher_id
  join public.student_groups sgr
    on sgr.group_id = ta.group_id and sgr.academic_year_id = ta.academic_year_id
  where ta.status = 'ACTIVE' and sgr.left_at is null
  union
  -- Les élèves de sa classe de professeur principal
  select se.student_id
  from public.classes c
  join me on me.id = c.head_teacher_id
  join public.student_enrollments se on se.class_id = c.id
  where se.status = 'ENROLLED';
$$;

revoke all on function app.my_linked_students() from public, anon;
grant execute on function app.my_linked_students() to authenticated, service_role;

-- Réécrit chaque règle de lecture qui appelle can_see_student. Rejouable : une
-- règle déjà réécrite ne contient plus l'appel et n'est pas retouchée.
do $$
declare
  r record;
  v_new text;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public' and qual like '%app.can_see_student(%'
  loop
    v_new := regexp_replace(
      r.qual,
      'app\.can_see_student\(([^,()]+), ([^,()]+)\)',
      '((SELECT app.is_platform_admin()) OR \1 IN (SELECT app.my_schools_with(''students.view''::text)) OR \2 IN (SELECT app.my_linked_students()))',
      'g'
    );
    execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_new);
  end loop;
end;
$$;
