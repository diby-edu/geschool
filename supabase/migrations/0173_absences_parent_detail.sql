-- =============================================================================
-- 0173 — Absences vues par le parent : l'heure et le professeur
-- =============================================================================
-- Demandé le 2026-10-31 : la liste des absences de l'Espace Parent ne disait que
-- la date et la matière. Il faut aussi l'heure et le nom du professeur. Un parent
-- ne peut pas lire la fiche des enseignants (règle 0059, coordonnées
-- comprises) : cette fonction ne rend que le NOM du professeur du cours, et
-- seulement pour les absences d'un enfant que le parent peut suivre (enfant
-- débloqué, 0172 : app.my_linked_students).
-- =============================================================================

create or replace function public.child_absence_details(p_school uuid, p_student uuid, p_from date, p_to date)
returns table (
  record_id uuid,
  occurs_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  course_hours integer,
  absent_hours smallint[],
  subject text,
  teacher text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id,
         o.occurs_on,
         coalesce(o.override_starts_at, o.starts_at),
         coalesce(o.override_ends_at, o.ends_at),
         app.session_course_hours(o.schedule_session_id),
         r.absent_hours,
         (select sj.name from schedule_sessions ss join subjects sj on sj.id = ss.subject_id where ss.id = o.schedule_session_id),
         (select nullif(btrim(upper(coalesce(te.last_name, '')) || ' ' || coalesce(te.first_name, '')), '')
            from teachers te
           where te.id = coalesce(
                   o.override_teacher_id,
                   (select st.teacher_id from schedule_session_teachers st
                     where st.session_id = o.schedule_session_id order by (st.role = 'LEAD') desc, st.teacher_id limit 1)))
  from attendance_records r
  join attendance_registers g on g.id = r.register_id
  join session_occurrences o on o.id = g.session_occurrence_id
  where r.school_id = p_school
    and r.student_id = p_student
    and r.status in ('ABSENT', 'EXCUSED')
    and o.occurs_on between p_from and p_to
    and (
      app.is_platform_admin()
      or app.can_read(p_school, 'attendance.view_all')
      or p_student in (select app.my_linked_students())
    )
$$;
revoke all on function public.child_absence_details(uuid, uuid, date, date) from public, anon;
grant execute on function public.child_absence_details(uuid, uuid, date, date) to authenticated;
