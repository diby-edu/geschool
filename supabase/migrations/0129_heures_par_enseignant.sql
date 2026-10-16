-- =============================================================================
-- 0129 — Heures faites : une ligne par enseignant (et non par cours)
-- =============================================================================
-- teacher_course_hours (0116) rend une ligne par cours. PostgREST plafonne
-- chaque réponse à 1 000 lignes : sur l'école de démo (170 enseignants), le
-- mois d'octobre compte ~6 000 cours, la page « Heures faites et paie » n'en
-- recevait que 1 000 — 27 enseignants, 701 h au lieu de ~5 700, paie fausse,
-- sans aucun message. Constaté le 2026-10-16.
--
-- Même calcul, regroupé : une ligne par enseignant, ses cours dans un tableau
-- JSON (dans l'ordre). Le droit reste vérifié par teacher_course_hours.
create or replace function public.teacher_course_hours_by_teacher(p_school uuid, p_from date, p_to date)
returns table (teacher_id uuid, courses jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.teacher_id,
         jsonb_agg(
           jsonb_build_object(
             'occurs_on', h.occurs_on,
             'starts_at', h.starts_at,
             'hours', h.hours,
             'done', h.done,
             'class_name', h.class_name,
             'subject', h.subject
           )
           order by h.starts_at
         )
  from public.teacher_course_hours(p_school, p_from, p_to) h
  group by h.teacher_id;
$$;

revoke all on function public.teacher_course_hours_by_teacher(uuid, date, date) from public, anon;
grant execute on function public.teacher_course_hours_by_teacher(uuid, date, date) to authenticated, service_role;
