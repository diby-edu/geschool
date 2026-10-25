-- =============================================================================
-- 0136 — Ce qu'on lit en base suit les droits cochés (notes, absences, cours)
-- =============================================================================
-- Constaté le 2026-10-25 en testant les 8 fonctions du personnel. Décidé le même
-- jour.
--
-- 1. Notes publiées : il fallait seulement « voir les élèves » (students.view)
--    pour lire toutes les notes publiées de l'école. Surveillant, Éducateur,
--    Secrétaire et Informaticien, sans aucun droit Notes, lisaient 361 600
--    notes de l'école de démo. Le chemin « note publiée » sert aux parents, aux
--    élèves et aux enseignants (leurs élèves) : il reste réservé à eux.
--    Le personnel lit les notes avec un droit Notes : grades.view_all, ou
--    grades.view avec students.view (comme avant).
--
-- 2. Appels (attendance_records) : « voir les élèves » suffisait aussi pour lire
--    toutes les présences. Il faut maintenant « voir les appels de toutes les
--    classes » (attendance.view_all). Parents, élèves et enseignants gardent
--    les présences de leurs élèves (my_linked_students).
--
-- 3. Qui voit tous les appels voit aussi les cours auxquels ils appartiennent
--    (séances, séances datées, classes, enseignants, salles). La Secrétaire
--    avait attendance.view_all sans schedule.view_all : le détail d'un appel lui
--    était refusé.
--
-- 4. Secrétaire et Informaticien : « voir l'emploi du temps » seul ne montre
--    que ses propres cours. Ils n'enseignent pas : emploi du temps vide,
--    impression refusée. Ils reçoivent schedule.view_all (le modèle, et les
--    copies d'école que l'école n'a pas modifiées). Une école peut décocher.
-- =============================================================================

-- 1. Notes ---------------------------------------------------------------------
drop policy grades_select on grades;
create policy grades_select on grades for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('grades.view_all'))
  or assessment_id in (select app.my_owned_assessments())
  or (
    school_id in (select app.my_schools_with('students.view'))
    and school_id in (select app.my_schools_with('grades.view'))
  )
  or (
    student_id in (select app.my_linked_students())
    and (
      school_id in (select app.my_schools_with('grades.view'))
      or assessment_id in (select app.my_published_assessments())
    )
  )
);

-- 2. Présences -----------------------------------------------------------------
drop policy attendance_records_select on attendance_records;
create policy attendance_records_select on attendance_records for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or student_id in (select app.my_linked_students())
);

-- 3. Les cours des appels --------------------------------------------------------
drop policy occurrences_select on session_occurrences;
create policy occurrences_select on session_occurrences for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or schedule_session_id in (select app.my_visible_sessions())
);

drop policy schedule_sessions_select on schedule_sessions;
create policy schedule_sessions_select on schedule_sessions for select
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or id in (select app.my_visible_sessions())
);

drop policy session_targets_select on schedule_session_targets;
create policy session_targets_select on schedule_session_targets for select
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or session_id in (select app.my_visible_sessions())
);

drop policy session_teachers_select on schedule_session_teachers;
create policy session_teachers_select on schedule_session_teachers for select
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or session_id in (select app.my_visible_sessions())
);

drop policy session_rooms_select on schedule_session_rooms;
create policy session_rooms_select on schedule_session_rooms for select
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or school_id in (select app.my_schools_with('attendance.view_all'))
  or session_id in (select app.my_visible_sessions())
);

-- 4. Secrétaire et Informaticien : l'emploi du temps de toute l'école -----------
do $$
declare
  v_ids uuid[];
begin
  -- Écriture interne : les garde-fous de 0050 visent les actions d'un utilisateur.
  perform set_config('app.roles_provisioning', 'on', true);

  -- La liste est arrêtée AVANT de toucher au modèle : sinon les copies seraient
  -- comparées au modèle déjà modifié.
  select array_agg(ro.id) into v_ids
  from public.roles ro
  join public.roles tpl on tpl.school_id is null and tpl.code = ro.code
  where ro.code in ('SECRETARY', 'IT_ADMIN')
    and (
      ro.school_id is null
      -- copie d'école restée identique au modèle
      or (select array_agg(p.code order by p.code)
          from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = ro.id)
       = (select array_agg(p.code order by p.code)
          from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = tpl.id)
    );

  insert into public.role_permissions (role_id, permission_id)
  select r_id, p.id
  from unnest(v_ids) as r_id
  cross join public.permissions p
  where p.code = 'schedule.view_all'
  on conflict do nothing;

  perform set_config('app.roles_provisioning', 'off', true);
end;
$$;
