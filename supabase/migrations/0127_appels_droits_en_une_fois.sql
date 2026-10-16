-- =============================================================================
-- 0127 — Lecture des appels : fin de 0126
-- =============================================================================
-- 0126 visait la règle « attendance_registers_select » ; elle s'appelle en
-- réalité « registers_select » et n'avait donc pas été réécrite. Même
-- transformation : can_see_session(école, cours de la séance) devient
--   école IN my_schools_with('schedule.view_all')
--   OR cours de la séance IN my_visible_sessions()
-- (équivalence vérifiée cours par cours pour 16 comptes, 2026-10-16).
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance_registers'
      and policyname = 'registers_select' and qual like '%app.can_see_session(%'
  ) then
    alter policy registers_select on public.attendance_registers using (
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
