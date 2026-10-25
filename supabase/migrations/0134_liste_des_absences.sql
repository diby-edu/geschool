-- =============================================================================
-- 0134 — Liste des absences et retards : une page à la fois, comptée en base
-- =============================================================================
-- La page « Absences et retards » lisait toutes les absences du mois (des
-- milliers de lignes sur un grand établissement), par paquets de 1 000 avec
-- leurs relations imbriquées : 104 s mesurées le 2026-10-24 (Directeur adjoint,
-- école de démo). Elle lit maintenant UNE page (100 lignes, les plus récentes
-- d'abord) et le total, en une seule requête.
--
-- Droits de l'appelant (security invoker) : les règles de lecture des appels,
-- des présences et des élèves s'appliquent comme avant.
create or replace function public.list_absences(
  p_school uuid,
  p_from date,
  p_to date,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  occurs_on date,
  student text,
  matricule text,
  class_name text,
  subject text,
  status text,
  minutes_late int,
  comment text,
  total bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select ar.id,
         o.occurs_on,
         upper(s.last_name) || ' ' || s.first_name,
         s.matricule,
         (select c.name from schedule_session_targets t join classes c on c.id = t.class_id
          where t.session_id = o.schedule_session_id and t.class_id is not null order by c.name limit 1),
         coalesce(sj.name, 'Cours'),
         ar.status::text,
         ar.minutes_late,
         ar.comment,
         count(*) over ()
  from attendance_records ar
  join attendance_registers r on r.id = ar.register_id
  join session_occurrences o on o.id = r.session_occurrence_id
  join students s on s.id = ar.student_id
  left join schedule_sessions ss on ss.id = o.schedule_session_id
  left join subjects sj on sj.id = ss.subject_id
  where ar.school_id = p_school
    and ar.status in ('ABSENT', 'LATE')
    and o.occurs_on between p_from and p_to
  order by o.occurs_on desc, s.last_name, s.first_name, ar.id
  limit greatest(1, least(p_limit, 500))
  offset greatest(0, p_offset);
$$;

revoke all on function public.list_absences(uuid, date, date, int, int) from public, anon;
grant execute on function public.list_absences(uuid, date, date, int, int) to authenticated;
