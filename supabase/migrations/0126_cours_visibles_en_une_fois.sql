-- =============================================================================
-- 0126 — Droits sur les cours et les appels : calculés une fois par requête
-- =============================================================================
-- Suite de 0121-0125. Les règles de lecture des cours (schedule_sessions et
-- tables liées), des séances (session_occurrences : ~100 000 lignes) et des
-- appels (attendance_registers) appelaient app.can_see_session() pour CHAQUE
-- ligne. Mesuré le 2026-10-16 : 12 s pour lire les cours d'un enseignant,
-- 8 s pour les appels du tableau de bord.
--
-- can_see_session(S, X) =
--      is_platform_admin()
--   OR (membre de S ET droit schedule.view_all)  = S IN my_schools_with('schedule.view_all')
--   OR je suis l'un des enseignants du cours X
--   OR X est un cours d'une version PUBLIÉE suivi par un de mes enfants (ou moi,
--      élève) inscrit dans la classe ou membre du groupe visé, de l'école S
-- devient
--   ((SELECT app.is_platform_admin()) OR S IN (SELECT app.my_schools_with('schedule.view_all'))
--    OR X IN (SELECT app.my_visible_sessions()))
--
-- my_visible_sessions() reprend mot pour mot les deux dernières recherches,
-- pour toutes les lignes à la fois. can_see_session reste pour les fonctions.
-- =============================================================================

create or replace function app.my_visible_sessions()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with mine as (
    -- = my_student_ids(école), pour toutes les écoles à la fois
    select sg.student_id, sg.school_id
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where g.user_id = auth.uid() and g.status = 'ACTIVE'
    union
    select s.id, s.school_id
    from public.students s
    where s.user_id = auth.uid() and s.deleted_at is null
  )
  -- Les cours dont je suis l'un des enseignants
  select st.session_id
  from public.schedule_session_teachers st
  join public.teachers t on t.id = st.teacher_id
  where t.user_id = auth.uid() and t.deleted_at is null
  union
  -- Les cours publiés de la classe ou du groupe d'un de mes enfants
  select s.id
  from public.schedule_sessions s
  join public.schedule_versions v on v.id = s.schedule_version_id
  join public.schedule_session_targets tg on tg.session_id = s.id
  left join public.student_enrollments se
    on se.class_id = tg.class_id
   and se.academic_year_id = s.academic_year_id
   and se.status = 'ENROLLED'
  left join public.student_groups sgr
    on sgr.group_id = tg.group_id
   and sgr.academic_year_id = s.academic_year_id
   and sgr.left_at is null
  where v.status = 'PUBLISHED'
    and s.school_id in (select school_id from mine)
    and exists (
      select 1 from mine
      where mine.school_id = s.school_id
        and mine.student_id = coalesce(se.student_id, sgr.student_id)
    );
$$;

revoke all on function app.my_visible_sessions() from public, anon;
grant execute on function app.my_visible_sessions() to authenticated, service_role;

do $$
declare
  r record;
  v_new text;
  v_check constant text :=
    '((SELECT app.is_platform_admin()) OR \1 IN (SELECT app.my_schools_with(''schedule.view_all''::text)) OR \2 IN (SELECT app.my_visible_sessions()))';
begin
  -- Cours, cibles, enseignants, salles, séances : le cours est une colonne.
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public' and qual like '%app.can_see_session(%'
      and tablename <> 'attendance_registers'
  loop
    v_new := regexp_replace(r.qual, 'app\.can_see_session\(([a-z_][a-z0-9_.]*), ([a-z_][a-z0-9_.]*)\)', v_check, 'g');
    if v_new <> r.qual then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_new);
    end if;
  end loop;

  -- Appels : le cours se lit dans la séance de l'appel (même sous-requête
  -- qu'avant). Règle écrite en entier : ses deux premiers termes sont inchangés.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance_registers'
      and policyname = 'attendance_registers_select' and qual like '%app.can_see_session(%'
  ) then
    alter policy attendance_registers_select on public.attendance_registers using (
      (select app.is_platform_admin())
      or school_id in (select app.my_schools_with('attendance.view_all'::text))
      or school_id in (select app.my_schools_with('schedule.view_all'::text))
      or (
        select o.schedule_session_id from public.session_occurrences o
        where o.id = attendance_registers.session_occurrence_id
      ) in (select app.my_visible_sessions())
    );
  end if;
end;
$$;
