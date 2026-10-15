-- =============================================================================
-- 0110 — Fin de trimestre : arrêt des notes, vérification, dispense d'EPS
-- =============================================================================
--
-- Le fonctionnement de l'établissement (décidé le 2026-10-15), par période :
--
--   1. ARRÊT DES NOTES (grades_stop_on) : à partir de cette date, plus aucune
--      nouvelle évaluation pour la période.
--   2. VÉRIFICATION AVEC LES ÉLÈVES (jusqu'à student_check_ends_on) : chaque
--      professeur revoit ses notes avec ses élèves et CORRIGE LUI-MÊME une
--      erreur, même sur une évaluation déjà clôturée. Il déclare ensuite
--      « J'ai fini mes moyennes », ce qui n'est possible que si CHAQUE élève a
--      une moyenne (ou est dispensé d'EPS).
--   3. VÉRIFICATION DU PROFESSEUR PRINCIPAL (jusqu'à head_check_ends_on) : les
--      professeurs peuvent encore corriger (réponse aux signalements, lot 2).
--   4. Après head_check_ends_on : les notes de la période sont FIGÉES, pour tout
--      le monde. Le conseil de classe se tient sur ces notes.
--
-- Les dates sont fixées par le droit `grades.term_dates` (directeur, adjoint,
-- censeur, fondateur par défaut ; cochable pour toute fonction). Sans dates,
-- rien ne change : la période reste ouverte, comme avant.
--
-- Tout ce qui touche aux notes à partir de l'arrêt est inscrit au journal
-- (audit_logs) : création, modification, effacement, dispense, « j'ai fini ».
--
-- Remplace la « fenêtre de calcul » de 0056 : app.grading_is_open suit
-- désormais la vérification quand les nouvelles dates sont posées.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Le droit de fixer les dates
-- -----------------------------------------------------------------------------
insert into permissions (code, module, action, description, is_platform_only) values
  ('grades.term_dates', 'grades', 'term_dates', 'Fixer les dates de fin de trimestre (arret des notes, verifications)', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR'])
  where p.code = 'grades.term_dates'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Les trois dates, sur la période
-- -----------------------------------------------------------------------------
alter table academic_periods
  add column if not exists grades_stop_on        date,
  add column if not exists student_check_ends_on date,
  add column if not exists head_check_ends_on    date;

alter table academic_periods drop constraint if exists academic_periods_term_end_order;
alter table academic_periods add constraint academic_periods_term_end_order check (
  (grades_stop_on is null or student_check_ends_on is null or student_check_ends_on >= grades_stop_on)
  and (student_check_ends_on is null or head_check_ends_on is null or head_check_ends_on >= student_check_ends_on)
  and (grades_stop_on is null or head_check_ends_on is null or head_check_ends_on >= grades_stop_on)
);

comment on column academic_periods.grades_stop_on is
  'Arret des notes : a partir de cette date, plus de nouvelle evaluation pour la periode.';
comment on column academic_periods.student_check_ends_on is
  'Dernier jour de la verification des notes avec les eleves.';
comment on column academic_periods.head_check_ends_on is
  'Dernier jour de la verification du professeur principal ; le lendemain, les notes sont figees.';

-- -----------------------------------------------------------------------------
-- 3. Où en est la période ?
--    OPEN          : saisie normale (aucune date, ou avant l'arrêt)
--    STUDENT_CHECK : arrêt passé, vérification avec les élèves
--    HEAD_CHECK    : vérification du professeur principal
--    FROZEN        : notes figées
-- -----------------------------------------------------------------------------
create or replace function app.school_today(p_school uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce(nullif(s.timezone, ''), 'UTC'))::date
  from schools s where s.id = p_school
$$;

create or replace function app.term_phase(p_period uuid, p_today date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when ap.grades_stop_on is null or p_today < ap.grades_stop_on then 'OPEN'
    when ap.student_check_ends_on is not null and p_today <= ap.student_check_ends_on then 'STUDENT_CHECK'
    when ap.head_check_ends_on is null then
      -- Fin de vérification non fixée : la vérification dure jusqu'à ce qu'on la fixe.
      case when ap.student_check_ends_on is null then 'STUDENT_CHECK' else 'HEAD_CHECK' end
    when p_today <= ap.head_check_ends_on then
      case when ap.student_check_ends_on is null then 'STUDENT_CHECK' else 'HEAD_CHECK' end
    else 'FROZEN'
  end
  from academic_periods ap
  where ap.id = p_period
$$;

create or replace function public.term_phase(p_period uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.term_phase(ap.id, app.school_today(ap.school_id))
  from academic_periods ap where ap.id = p_period
$$;

grant execute on function app.school_today(uuid) to authenticated, service_role;
grant execute on function app.term_phase(uuid, date) to authenticated, service_role;
grant execute on function public.term_phase(uuid) to authenticated, service_role;

-- La « fenêtre de calcul » de 0056 suit maintenant la vérification, quand les
-- nouvelles dates sont posées (le tableau de bord de la direction s'y appuie).
create or replace function app.grading_is_open(p_period uuid, p_today date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when ap.grades_stop_on is not null then app.term_phase(ap.id, p_today) in ('STUDENT_CHECK', 'HEAD_CHECK')
    else case ap.grading_override
           when 'OPEN' then true
           when 'CLOSED' then false
           else (ap.grading_starts_on is not null and ap.grading_ends_on is not null
                 and p_today between ap.grading_starts_on and ap.grading_ends_on)
         end
  end
  from academic_periods ap
  where ap.id = p_period
$$;

-- -----------------------------------------------------------------------------
-- 4. Journal de fin de trimestre (audit_logs, écrit par la base elle-même)
-- -----------------------------------------------------------------------------
create or replace function app.log_term_event(
  p_school uuid, p_action text, p_entity_type text, p_entity uuid, p_before jsonb, p_after jsonb
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into audit_logs (school_id, actor_user_id, actor_is_platform_admin, action, module, entity_type, entity_id, before, after)
  values (p_school, auth.uid(), coalesce(app.is_platform_admin(), false), p_action, 'grades', p_entity_type, p_entity, p_before, p_after);
$$;

-- -----------------------------------------------------------------------------
-- 5. Dispense d'EPS : décidée par le professeur d'EPS de l'élève, par période
-- -----------------------------------------------------------------------------
create table if not exists subject_exemptions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  subject_id         uuid not null references subjects(id) on delete cascade,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (academic_period_id, student_id, subject_id)
);
create index if not exists subject_exemptions_school_idx on subject_exemptions (school_id, academic_period_id);

alter table subject_exemptions enable row level security;
alter table subject_exemptions force  row level security;

drop policy if exists subject_exemptions_select on subject_exemptions;
create policy subject_exemptions_select on subject_exemptions for select to authenticated
using (app.can_see_student(school_id, student_id));
-- Aucune écriture directe : tout passe par public.set_eps_exemption.
grant select on subject_exemptions to authenticated;

-- La matière est-elle l'EPS ? (code officiel, ou nom usuel)
create or replace function app.is_eps(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from subjects s
    where s.id = p_subject
      and (upper(s.code) = 'EPS' or s.name ilike 'EPS%' or s.name ilike 'éducation physique%' or s.name ilike 'education physique%')
  )
$$;

-- L'utilisateur enseigne-t-il cette matière à cet élève (sa classe ou un de ses groupes) ?
create or replace function app.teaches_subject_to(p_subject uuid, p_student uuid, p_year uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from teaching_assignments ta
    join teachers t on t.id = ta.teacher_id and t.user_id = auth.uid() and t.deleted_at is null
    where ta.subject_id = p_subject
      and ta.academic_year_id = p_year
      and ta.status = 'ACTIVE'
      and (
        ta.class_id in (select se.class_id from student_enrollments se
                         where se.student_id = p_student and se.academic_year_id = p_year and se.status = 'ENROLLED')
        or ta.group_id in (select sg.group_id from student_groups sg
                            where sg.student_id = p_student and sg.left_at is null)
      )
  )
$$;

create or replace function public.set_eps_exemption(p_student uuid, p_period uuid, p_subject uuid, p_exempt boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_per   academic_periods%rowtype;
  v_notes int;
  v_name  text;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then
    raise exception 'Période introuvable.' using errcode = 'P0002';
  end if;
  if not app.is_eps(p_subject) then
    raise exception 'La dispense ne concerne que l''EPS.' using errcode = '22023';
  end if;
  if not (app.is_platform_admin() or app.teaches_subject_to(p_subject, p_student, v_per.academic_year_id)) then
    raise exception 'Seul le professeur d''EPS de l''élève peut le déclarer dispensé.' using errcode = '42501';
  end if;
  if not app.is_platform_admin() and app.term_phase(p_period, app.school_today(v_per.school_id)) = 'FROZEN' then
    raise exception 'Les notes de « % » sont figées : la dispense ne peut plus changer.', v_per.name using errcode = '42501';
  end if;

  if p_exempt then
    -- Un élève dispensé n'a pas de note : on n'efface jamais une note en cachette.
    select count(*) into v_notes
    from grades g join assessments a on a.id = g.assessment_id
    where g.student_id = p_student and a.subject_id = p_subject and a.academic_period_id = p_period
      and (g.score is not null or g.is_absent);
    if v_notes > 0 then
      raise exception 'Cet élève a déjà % note(s) en EPS sur « % » : effacez-les avant de le déclarer dispensé.', v_notes, v_per.name
        using errcode = '23514';
    end if;
    insert into subject_exemptions (school_id, academic_period_id, student_id, subject_id, created_by)
    values (v_per.school_id, p_period, p_student, p_subject, auth.uid())
    on conflict (academic_period_id, student_id, subject_id) do nothing;
  else
    delete from subject_exemptions
     where academic_period_id = p_period and student_id = p_student and subject_id = p_subject;
  end if;

  select last_name || ' ' || first_name into v_name from students where id = p_student;
  perform app.log_term_event(
    v_per.school_id,
    case when p_exempt then 'grades.exemption_add' else 'grades.exemption_remove' end,
    'student', p_student, null,
    jsonb_build_object('student', v_name, 'subject_id', p_subject, 'period', v_per.name)
  );
end;
$$;

revoke all on function public.set_eps_exemption(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_eps_exemption(uuid, uuid, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Les notes : figées après la vérification, fermées aux dispensés, journalisées
-- -----------------------------------------------------------------------------
create or replace function app.guard_grade_term()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row    grades%rowtype;
  v_a      assessments%rowtype;
  v_phase  text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_a from assessments where id = v_row.assessment_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_phase := app.term_phase(v_a.academic_period_id, app.school_today(v_a.school_id));

  if v_phase = 'FROZEN' and auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'Les notes de cette période sont figées : la vérification est terminée.' using errcode = '42501';
  end if;

  if tg_op <> 'DELETE' and (new.score is not null or new.is_absent) and exists (
    select 1 from subject_exemptions e
    where e.academic_period_id = v_a.academic_period_id and e.student_id = new.student_id and e.subject_id = v_a.subject_id
  ) then
    raise exception 'Cet élève est dispensé d''EPS : il ne peut pas recevoir de note.' using errcode = '23514';
  end if;

  -- À partir de l'arrêt des notes, tout est inscrit au journal.
  if v_phase <> 'OPEN' and (
       tg_op <> 'UPDATE'
       or new.score is distinct from old.score
       or new.is_absent is distinct from old.is_absent
       or new.is_excused is distinct from old.is_excused
       or new.is_excluded_from_average is distinct from old.is_excluded_from_average
     ) then
    perform app.log_term_event(
      v_a.school_id,
      case tg_op when 'INSERT' then 'grades.term_create' when 'UPDATE' then 'grades.term_update' else 'grades.term_delete' end,
      'grade', v_row.id,
      case when tg_op = 'INSERT' then null
           else jsonb_build_object('score', old.score, 'is_absent', old.is_absent, 'is_excused', old.is_excused,
                                   'student_id', old.student_id, 'assessment_id', old.assessment_id) end,
      case when tg_op = 'DELETE' then null
           else jsonb_build_object('score', new.score, 'is_absent', new.is_absent, 'is_excused', new.is_excused,
                                   'student_id', new.student_id, 'assessment_id', new.assessment_id,
                                   'subject_id', v_a.subject_id, 'period_id', v_a.academic_period_id, 'phase', v_phase) end
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists grades_term_guard on grades;
create trigger grades_term_guard
  before insert or update or delete on grades
  for each row execute function app.guard_grade_term();

-- Pendant la vérification, le professeur corrige SES notes, même sur une
-- évaluation qu'il avait déjà clôturée.
create or replace function app.teacher_can_edit_grades(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.assessment_is_open(p_assessment)
      or exists (
        select 1 from public.assessments a
        where a.id = p_assessment
          and app.term_phase(a.academic_period_id, app.school_today(a.school_id)) in ('STUDENT_CHECK', 'HEAD_CHECK')
      );
$$;

drop policy if exists grades_update on grades;
create policy grades_update on grades for update to authenticated
using (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id) and app.teacher_can_edit_grades(assessment_id))
)
with check (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id) and app.teacher_can_edit_grades(assessment_id))
);

drop policy if exists grades_delete on public.grades;
create policy grades_delete on public.grades
for delete using (
  app.can_write(school_id, 'grades.delete')
  or (app.owns_assessment(assessment_id) and app.teacher_can_edit_grades(assessment_id))
);

-- -----------------------------------------------------------------------------
-- 7. Les évaluations : plus de nouvelle évaluation après l'arrêt des notes
-- -----------------------------------------------------------------------------
create or replace function app.guard_assessment_term()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phase text;
  v_stop  date;
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.academic_period_id is not distinct from old.academic_period_id then
    return new;
  end if;
  v_phase := app.term_phase(new.academic_period_id, app.school_today(new.school_id));
  if v_phase <> 'OPEN' then
    select grades_stop_on into v_stop from academic_periods where id = new.academic_period_id;
    raise exception 'Arrêt des notes depuis le % : plus de nouvelle évaluation pour cette période.',
      to_char(v_stop, 'DD/MM/YYYY') using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_term_guard on assessments;
create trigger assessments_term_guard
  before insert or update of academic_period_id on assessments
  for each row execute function app.guard_assessment_term();

-- -----------------------------------------------------------------------------
-- 8. « J'ai fini mes moyennes » : seulement si chaque élève a une moyenne
-- -----------------------------------------------------------------------------
create or replace function app.missing_averages(p_assignment uuid, p_period uuid)
returns table (student_id uuid, student_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with asg as (
    select ta.* from teaching_assignments ta where ta.id = p_assignment
  ),
  eleves as (
    select se.student_id from student_enrollments se, asg
    where asg.class_id is not null and se.class_id = asg.class_id
      and se.academic_year_id = asg.academic_year_id and se.status = 'ENROLLED'
    union
    select sg.student_id from student_groups sg, asg
    where asg.group_id is not null and sg.group_id = asg.group_id and sg.left_at is null
  )
  select e.student_id, s.last_name || ' ' || s.first_name
  from eleves e
  join students s on s.id = e.student_id
  cross join asg
  where not exists (
          select 1 from subject_exemptions x
          where x.academic_period_id = p_period and x.student_id = e.student_id and x.subject_id = asg.subject_id
        )
    and not exists (
          select 1
          from grades g
          join assessments a on a.id = g.assessment_id
          join assessment_types t on t.id = a.assessment_type_id
          where g.student_id = e.student_id
            and a.subject_id = asg.subject_id
            and a.academic_period_id = p_period
            and t.counts_in_average
            and not g.is_excluded_from_average
            and g.score is not null
        )
  order by 2
$$;

create or replace function public.missing_averages(p_assignment uuid, p_period uuid)
returns table (student_id uuid, student_name text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from app.missing_averages(p_assignment, p_period)
  where app.owns_assignment(p_assignment) or app.is_platform_admin()
     or app.can_read((select school_id from teaching_assignments where id = p_assignment), 'grades.view_all')
$$;
grant execute on function app.missing_averages(uuid, uuid) to authenticated, service_role;
grant execute on function public.missing_averages(uuid, uuid) to authenticated, service_role;

create or replace function app.guard_average_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asg     teaching_assignments%rowtype;
  v_per     academic_periods%rowtype;
  v_missing int;
  v_names   text;
begin
  select * into v_asg from teaching_assignments where id = new.teaching_assignment_id;
  select * into v_per from academic_periods where id = new.academic_period_id;
  if v_asg.id is null or v_per.id is null
     or v_asg.school_id <> new.school_id or v_per.school_id <> new.school_id
     or v_asg.academic_year_id <> v_per.academic_year_id then
    raise exception 'Affectation ou periode invalide.' using errcode = '23503';
  end if;
  if app.is_platform_admin() then
    return new;
  end if;
  if app.term_phase(new.academic_period_id, app.school_today(new.school_id)) = 'FROZEN' then
    raise exception 'Les notes de cette période sont figées.' using errcode = '42501';
  end if;

  select count(*), string_agg(m.student_name, ', ' order by m.student_name)
    into v_missing, v_names
  from (select * from app.missing_averages(new.teaching_assignment_id, new.academic_period_id) limit 6) m;
  if v_missing > 0 then
    select count(*) into v_missing from app.missing_averages(new.teaching_assignment_id, new.academic_period_id);
    if v_missing > 6 then
      v_names := v_names || ', …';
    end if;
    raise exception 'Impossible : % élève(s) sans moyenne (%). Saisissez leurs notes, ou déclarez-les dispensés d''EPS.',
      v_missing, v_names
      using errcode = '23514';
  end if;

  perform app.log_term_event(new.school_id, 'grades.completion', 'teaching_assignment', new.teaching_assignment_id,
                             null, jsonb_build_object('period_id', new.academic_period_id));
  return new;
end;
$$;

-- Rouvrir ses moyennes : tant que les notes ne sont pas figées.
drop policy if exists average_completions_delete on average_completions;
create policy average_completions_delete on average_completions for delete to authenticated
using (
  (app.owns_assignment(teaching_assignment_id)
   and app.term_phase(academic_period_id, app.school_today(school_id)) <> 'FROZEN')
  or app.can_write(school_id, 'academic_years.manage')
);
