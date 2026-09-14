-- =============================================================================
-- 0041 — Performance de la moyenne « a tout moment » (0038) a l'echelle reelle
-- =============================================================================
--
-- app.class_subject_averages (0038) est SECURITY INVOKER : pour chaque eleve
-- de la classe, elle appelle app.student_subject_average, qui interroge
-- grades/assessments/assessment_types SOUS LA RLS DE L'APPELANT. Chacune de
-- ces trois tables porte une policy a sous-requetes correlees
-- (owns_assessment, can_see_student…) — non couteuse en soi, mais reevaluee
-- une fois PAR ELEVE PAR TABLE. A l'echelle d'une vraie classe (~50 eleves),
-- constate en conditions reelles (Ecole 1, cle d'un enseignant authentifie,
-- pas la cle de service) : le calcul entier depasse le statement_timeout
-- Postgres et l'ecran « Moyennes et classement » de l'enseignant echoue
-- purement et simplement (aucune moyenne affichee).
--
-- Meme classe de probleme que app.can_see_session (schedule_sessions,
-- deja recontre) : la fonction interne doit sortir de la RLS pour payer son
-- cout de securite UNE fois, pas une fois par ligne. Solution la plus etroite
-- possible : seule app.class_subject_averages devient SECURITY DEFINER, avec
-- SA PROPRE verification d'autorisation explicite (ADR-013 : ce pouvoir se
-- paie toujours d'un controle manuel). app.student_subject_average reste
-- INCHANGEE (SECURITY INVOKER) — appelee depuis l'interieur d'une fonction
-- SECURITY DEFINER, elle s'execute deja avec les privileges du proprietaire
-- de CETTE fonction (contexte de securite empile), donc sans le cout RLS non
-- plus ; ses AUTRES appelants directs (public.student_subject_average, 0036)
-- ne sont pas affectes et gardent leur comportement/perimetre actuels.

create or replace function app.can_view_class_subject_grades(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = p_class
        and app.can_read(c.school_id, 'grades.view_all')
    )
    or exists (
      select 1
      from public.teaching_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.class_id = p_class
        and ta.subject_id = p_subject
        and ta.status = 'ACTIVE'
        and t.user_id = auth.uid()
        and t.deleted_at is null
    )
    or app.is_head_teacher_of(p_class);
$$;

grant execute on function app.can_view_class_subject_grades(uuid, uuid) to authenticated, service_role;

create or replace function app.class_subject_averages(
  p_class   uuid,
  p_period  uuid,
  p_subject uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false
)
returns table (student_id uuid, average numeric)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select se.student_id,
         app.student_subject_average(
           se.student_id, p_subject, p_period,
           p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
         ) as average
  from public.student_enrollments se
  join public.academic_periods ap on ap.id = p_period
  where se.class_id = p_class
    and se.academic_year_id = ap.academic_year_id
    and se.status = 'ENROLLED'
    and app.can_view_class_subject_grades(p_class, p_subject);
$$;

grant execute on function
  app.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;
