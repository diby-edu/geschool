-- =============================================================================
-- 0111 — Professeur principal : signalements, certification, déverrouillage
-- =============================================================================
--
-- Suite de 0110 (fin de trimestre). Décidé le 2026-10-15 :
--
--   - Le PROFESSEUR PRINCIPAL d'une classe vérifie, avec ses élèves, toutes les
--     moyennes de sa classe (la matrice). Un élève conteste une moyenne : le
--     professeur principal clique « Signaler » sur la case élève × matière, rien
--     à écrire. L'élève va voir le professeur de la matière, qui CORRIGE ou
--     MAINTIENT, puis valide : le signalement est réglé.
--   - Il CERTIFIE sa classe seulement si toutes les matières sont déclarées
--     « J'ai fini » par leurs professeurs ET tous ses signalements réglés.
--   - Une classe certifiée est figée : plus personne ne modifie ses notes.
--   - Le DÉVERROUILLAGE (droit `grades.unlock_class`, motif obligatoire) annule
--     la certification : les notes de la classe redeviennent modifiables, même
--     après la date de gel, jusqu'à ce que le professeur principal recertifie.
--   - Tout est journalisé.
--
-- Nouveaux droits : grades.unlock_class, reports.matrix, grades.term_journal.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Droits
-- -----------------------------------------------------------------------------
insert into permissions (code, module, action, description, is_platform_only) values
  ('grades.unlock_class', 'grades', 'unlock_class', 'Deverrouiller une classe certifiee par son professeur principal', false),
  ('reports.matrix', 'reports', 'matrix', 'Tirer les matrices (professeur principal et conseil de classe)', false),
  ('grades.term_journal', 'grades', 'term_journal', 'Consulter le journal de fin de trimestre', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on (
       (p.code in ('grades.unlock_class', 'grades.term_journal')
        and r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR']))
    or (p.code = 'reports.matrix'
        and r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR', 'IT_ADMIN']))
  )
  where p.code in ('grades.unlock_class', 'reports.matrix', 'grades.term_journal')
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. État de la classe pour la période : certifiée, ou déverrouillée
-- -----------------------------------------------------------------------------
create table if not exists class_term_status (
  school_id          uuid not null references schools(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  class_id           uuid not null references classes(id) on delete cascade,
  certified_at       timestamptz,
  certified_by       uuid references users(id) on delete set null,
  unlocked_at        timestamptz,
  unlocked_by        uuid references users(id) on delete set null,
  unlock_reason      text,
  primary key (academic_period_id, class_id)
);

alter table class_term_status enable row level security;
alter table class_term_status force  row level security;
drop policy if exists class_term_status_select on class_term_status;
create policy class_term_status_select on class_term_status for select to authenticated
using (app.is_member_of(school_id) or app.is_platform_admin());
grant select on class_term_status to authenticated;

create or replace function app.class_certified(p_class uuid, p_period uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from class_term_status s
                 where s.class_id = p_class and s.academic_period_id = p_period and s.certified_at is not null)
$$;

create or replace function app.class_unlocked(p_class uuid, p_period uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from class_term_status s
                 where s.class_id = p_class and s.academic_period_id = p_period
                   and s.unlocked_at is not null and s.certified_at is null)
$$;

-- La classe d'un élève pour l'année d'une période.
create or replace function app.student_class_for_period(p_student uuid, p_period uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select se.class_id
  from student_enrollments se
  join academic_periods ap on ap.id = p_period and ap.academic_year_id = se.academic_year_id
  where se.student_id = p_student and se.status = 'ENROLLED'
  limit 1
$$;

-- Les classes touchées par une évaluation (sa classe, ou les classes de son groupe).
create or replace function app.assessment_classes(p_assessment uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.class_id from assessments a where a.id = p_assessment and a.class_id is not null
  union
  select gc.class_id from assessments a join group_classes gc on gc.group_id = a.group_id
  where a.id = p_assessment and a.group_id is not null
$$;

grant execute on function app.class_certified(uuid, uuid), app.class_unlocked(uuid, uuid),
  app.student_class_for_period(uuid, uuid), app.assessment_classes(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Les notes : figées dès la certification ; rouvertes par un déverrouillage
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
  v_class  uuid;
  v_cname  text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_a from assessments where id = v_row.assessment_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_phase := app.term_phase(v_a.academic_period_id, app.school_today(v_a.school_id));
  v_class := app.student_class_for_period(v_row.student_id, v_a.academic_period_id);

  if auth.uid() is not null and not app.is_platform_admin() then
    if v_class is not null and app.class_certified(v_class, v_a.academic_period_id) then
      select name into v_cname from classes where id = v_class;
      raise exception 'La % est certifiée par son professeur principal : ses notes ne se modifient plus. Demandez un déverrouillage à la direction.',
        v_cname using errcode = '42501';
    end if;
    if v_phase = 'FROZEN' and not (v_class is not null and app.class_unlocked(v_class, v_a.academic_period_id)) then
      raise exception 'Les notes de cette période sont figées : la vérification est terminée.' using errcode = '42501';
    end if;
  end if;

  if tg_op <> 'DELETE' and (new.score is not null or new.is_absent) and exists (
    select 1 from subject_exemptions e
    where e.academic_period_id = v_a.academic_period_id and e.student_id = new.student_id and e.subject_id = v_a.subject_id
  ) then
    raise exception 'Cet élève est dispensé d''EPS : il ne peut pas recevoir de note.' using errcode = '23514';
  end if;

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
           else jsonb_build_object('score', old.score, 'is_absent', old.is_absent, 'is_excused', old.is_excused) end,
      jsonb_build_object('score', case when tg_op = 'DELETE' then null else new.score end,
                         'is_absent', case when tg_op = 'DELETE' then null else new.is_absent end,
                         'is_excused', case when tg_op = 'DELETE' then null else new.is_excused end,
                         'student_id', v_row.student_id, 'assessment_id', v_row.assessment_id,
                         'subject_id', v_a.subject_id, 'period_id', v_a.academic_period_id,
                         'class_id', v_class, 'phase', v_phase)
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Le professeur corrige SES notes pendant la vérification, ou quand sa classe
-- a été déverrouillée ; jamais sur une classe certifiée (le déclencheur refuse).
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
          and (
            app.term_phase(a.academic_period_id, app.school_today(a.school_id)) in ('STUDENT_CHECK', 'HEAD_CHECK')
            or exists (select 1 from app.assessment_classes(a.id) c(class_id)
                       where app.class_unlocked(c.class_id, a.academic_period_id))
          )
      );
$$;

-- -----------------------------------------------------------------------------
-- 4. Les signalements du professeur principal
-- -----------------------------------------------------------------------------
create table if not exists grade_flags (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  class_id           uuid not null references classes(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  subject_id         uuid not null references subjects(id) on delete cascade,
  raised_by          uuid references users(id) on delete set null,
  raised_at          timestamptz not null default now(),
  status             text not null default 'OPEN',
  resolved_by        uuid references users(id) on delete set null,
  resolved_at        timestamptz,
  constraint grade_flags_status check (status in ('OPEN', 'CORRECTED', 'MAINTAINED', 'CANCELLED'))
);
create unique index if not exists grade_flags_one_open
  on grade_flags (academic_period_id, student_id, subject_id) where status = 'OPEN';
create index if not exists grade_flags_class_idx on grade_flags (class_id, academic_period_id);

alter table grade_flags enable row level security;
alter table grade_flags force  row level security;
drop policy if exists grade_flags_select on grade_flags;
create policy grade_flags_select on grade_flags for select to authenticated
using (
  app.is_platform_admin()
  or app.is_head_teacher_of(class_id)
  or app.can_read(school_id, 'grades.view_all')
  or app.teaches_subject_to(subject_id, student_id,
       (select ap.academic_year_id from academic_periods ap where ap.id = academic_period_id))
);
grant select on grade_flags to authenticated;
-- Écritures : uniquement par les fonctions ci-dessous.

-- Les professeurs de la matière, pour cet élève (classe entière ou groupe).
create or replace function app.subject_teachers_of(p_subject uuid, p_student uuid, p_year uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct t.user_id
  from teaching_assignments ta
  join teachers t on t.id = ta.teacher_id and t.user_id is not null and t.deleted_at is null
  where ta.subject_id = p_subject and ta.academic_year_id = p_year and ta.status = 'ACTIVE'
    and (
      ta.class_id in (select se.class_id from student_enrollments se
                       where se.student_id = p_student and se.academic_year_id = p_year and se.status = 'ENROLLED')
      or ta.group_id in (select sg.group_id from student_groups sg where sg.student_id = p_student and sg.left_at is null)
    )
$$;

create or replace function public.flag_grade(p_class uuid, p_period uuid, p_student uuid, p_subject uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_per    academic_periods%rowtype;
  v_id     uuid;
  v_name   text;
  v_subj   text;
  v_cname  text;
  v_user   uuid;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then raise exception 'Période introuvable.' using errcode = 'P0002'; end if;
  if not (app.is_head_teacher_of(p_class) or app.is_platform_admin()) then
    raise exception 'Seul le professeur principal de la classe peut signaler.' using errcode = '42501';
  end if;
  if app.class_certified(p_class, p_period) then
    raise exception 'La classe est déjà certifiée.' using errcode = '42501';
  end if;
  if app.term_phase(p_period, app.school_today(v_per.school_id)) = 'FROZEN' and not app.class_unlocked(p_class, p_period) then
    raise exception 'Les notes de cette période sont figées.' using errcode = '42501';
  end if;
  if app.student_class_for_period(p_student, p_period) is distinct from p_class then
    raise exception 'Cet élève n''est pas dans la classe.' using errcode = '22023';
  end if;

  insert into grade_flags (school_id, academic_period_id, class_id, student_id, subject_id, raised_by)
  values (v_per.school_id, p_period, p_class, p_student, p_subject, auth.uid())
  on conflict (academic_period_id, student_id, subject_id) where status = 'OPEN' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from grade_flags
     where academic_period_id = p_period and student_id = p_student and subject_id = p_subject and status = 'OPEN';
    return v_id;
  end if;

  select last_name || ' ' || first_name into v_name from students where id = p_student;
  select name into v_subj from subjects where id = p_subject;
  select name into v_cname from classes where id = p_class;

  -- Le professeur de la matière est prévenu.
  for v_user in select * from app.subject_teachers_of(p_subject, p_student, v_per.academic_year_id) loop
    insert into notifications (school_id, user_id, type, title, body, data, entity_type, entity_id)
    values (v_per.school_id, v_user, 'grade_flag',
            'Moyenne signalée par le professeur principal',
            format('%s (%s) — %s, %s : l''élève va venir vous voir. Corrigez ou maintenez sa moyenne, puis validez.',
                   v_name, v_cname, v_subj, v_per.name),
            jsonb_build_object('class_id', p_class, 'period_id', p_period, 'subject_id', p_subject, 'student_id', p_student),
            'grade_flag', v_id);
  end loop;

  perform app.log_term_event(v_per.school_id, 'grades.flag', 'grade_flag', v_id, null,
    jsonb_build_object('student', v_name, 'student_id', p_student, 'subject', v_subj, 'subject_id', p_subject,
                       'class_id', p_class, 'period_id', p_period));
  return v_id;
end;
$$;

-- Le professeur de la matière règle le signalement : corrigé, ou maintenu.
-- Le professeur principal peut aussi l'annuler (signalé par erreur).
create or replace function public.resolve_grade_flag(p_flag uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  f      grade_flags%rowtype;
  v_year uuid;
begin
  select * into f from grade_flags where id = p_flag;
  if not found then raise exception 'Signalement introuvable.' using errcode = 'P0002'; end if;
  if f.status <> 'OPEN' then raise exception 'Ce signalement est déjà réglé.' using errcode = '22023'; end if;
  if p_status not in ('CORRECTED', 'MAINTAINED', 'CANCELLED') then
    raise exception 'Statut inconnu.' using errcode = '22023';
  end if;
  select academic_year_id into v_year from academic_periods where id = f.academic_period_id;
  if p_status = 'CANCELLED' then
    if not (app.is_head_teacher_of(f.class_id) or app.is_platform_admin()) then
      raise exception 'Seul le professeur principal peut annuler son signalement.' using errcode = '42501';
    end if;
  elsif not (app.teaches_subject_to(f.subject_id, f.student_id, v_year) or app.is_platform_admin()) then
    raise exception 'Seul le professeur de la matière règle ce signalement.' using errcode = '42501';
  end if;

  update grade_flags set status = p_status, resolved_by = auth.uid(), resolved_at = now() where id = p_flag;
  perform app.log_term_event(f.school_id, 'grades.flag_' || lower(p_status), 'grade_flag', p_flag,
    jsonb_build_object('status', 'OPEN'),
    jsonb_build_object('status', p_status, 'student_id', f.student_id, 'subject_id', f.subject_id,
                       'class_id', f.class_id, 'period_id', f.academic_period_id));
end;
$$;

revoke all on function public.flag_grade(uuid, uuid, uuid, uuid), public.resolve_grade_flag(uuid, text) from public, anon;
grant execute on function public.flag_grade(uuid, uuid, uuid, uuid), public.resolve_grade_flag(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Ce qui manque pour certifier : matières non déclarées finies, signalements ouverts
-- -----------------------------------------------------------------------------
-- Les affectations de la classe pour la période : classe entière, et groupes de la classe.
create or replace function app.class_assignments(p_class uuid, p_period uuid)
returns table (assignment_id uuid, subject_id uuid, teacher_id uuid, group_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select ta.id, ta.subject_id, ta.teacher_id, ta.group_id
  from teaching_assignments ta
  join academic_periods ap on ap.id = p_period and ap.academic_year_id = ta.academic_year_id
  where ta.status = 'ACTIVE'
    and (ta.academic_period_id is null or ta.academic_period_id = p_period)
    and (ta.class_id = p_class
         or ta.group_id in (select gc.group_id from group_classes gc where gc.class_id = p_class))
$$;

create or replace function public.class_certification_blockers(p_class uuid, p_period uuid)
returns table (kind text, subject text, teacher text, student text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select 'NOT_DONE', s.name, nullif(btrim(t.first_name || ' ' || t.last_name), ''), null::text
  from app.class_assignments(p_class, p_period) a
  join subjects s on s.id = a.subject_id
  join teachers t on t.id = a.teacher_id
  where (app.is_head_teacher_of(p_class) or app.is_platform_admin()
         or app.can_read((select school_id from classes where id = p_class), 'grades.view_all'))
    and not exists (select 1 from average_completions ac
                    where ac.teaching_assignment_id = a.assignment_id and ac.academic_period_id = p_period)
  union all
  select 'OPEN_FLAG', s.name,
         (select string_agg(distinct nullif(btrim(t.first_name || ' ' || t.last_name), ''), ', ')
            from teachers t
           where t.user_id in (select * from app.subject_teachers_of(f.subject_id, f.student_id,
                   (select academic_year_id from academic_periods where id = p_period)))),
         st.last_name || ' ' || st.first_name
  from grade_flags f
  join subjects s on s.id = f.subject_id
  join students st on st.id = f.student_id
  where f.class_id = p_class and f.academic_period_id = p_period and f.status = 'OPEN'
    and (app.is_head_teacher_of(p_class) or app.is_platform_admin()
         or app.can_read(f.school_id, 'grades.view_all'))
$$;
grant execute on function app.class_assignments(uuid, uuid) to authenticated, service_role;
grant execute on function public.class_certification_blockers(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Certifier, déverrouiller
-- -----------------------------------------------------------------------------
create or replace function public.certify_class(p_class uuid, p_period uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_per   academic_periods%rowtype;
  v_count int;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then raise exception 'Période introuvable.' using errcode = 'P0002'; end if;
  if not (app.is_head_teacher_of(p_class) or app.is_platform_admin()) then
    raise exception 'Seul le professeur principal de la classe peut la certifier.' using errcode = '42501';
  end if;
  if app.term_phase(p_period, app.school_today(v_per.school_id)) = 'FROZEN' and not app.class_unlocked(p_class, p_period) then
    raise exception 'Les notes de cette période sont figées : la certification n''est plus possible.' using errcode = '42501';
  end if;

  select count(*) into v_count from public.class_certification_blockers(p_class, p_period) where kind = 'NOT_DONE';
  if v_count > 0 then
    raise exception 'Certification impossible : % matière(s) ne sont pas encore déclarées « finies » par leur professeur.', v_count
      using errcode = '23514';
  end if;
  select count(*) into v_count from public.class_certification_blockers(p_class, p_period) where kind = 'OPEN_FLAG';
  if v_count > 0 then
    raise exception 'Certification impossible : % signalement(s) ne sont pas encore réglés.', v_count using errcode = '23514';
  end if;

  insert into class_term_status (school_id, academic_period_id, class_id, certified_at, certified_by)
  values (v_per.school_id, p_period, p_class, now(), auth.uid())
  on conflict (academic_period_id, class_id)
  do update set certified_at = now(), certified_by = auth.uid();

  perform app.log_term_event(v_per.school_id, 'grades.certify', 'class', p_class, null,
    jsonb_build_object('class_id', p_class, 'period_id', p_period));
end;
$$;

create or replace function public.unlock_class(p_class uuid, p_period uuid, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_per  academic_periods%rowtype;
  v_prev class_term_status%rowtype;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then raise exception 'Période introuvable.' using errcode = 'P0002'; end if;
  if not (app.is_platform_admin() or app.can_write(v_per.school_id, 'grades.unlock_class')) then
    raise exception 'Droit requis : déverrouiller une classe.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Le motif du déverrouillage est obligatoire.' using errcode = '22023';
  end if;
  select * into v_prev from class_term_status where academic_period_id = p_period and class_id = p_class;

  insert into class_term_status (school_id, academic_period_id, class_id, unlocked_at, unlocked_by, unlock_reason)
  values (v_per.school_id, p_period, p_class, now(), auth.uid(), btrim(p_reason))
  on conflict (academic_period_id, class_id)
  do update set certified_at = null, certified_by = null,
                unlocked_at = now(), unlocked_by = auth.uid(), unlock_reason = btrim(p_reason);

  perform app.log_term_event(v_per.school_id, 'grades.unlock', 'class', p_class,
    case when v_prev.certified_at is null then null
         else jsonb_build_object('certified_at', v_prev.certified_at, 'certified_by', v_prev.certified_by) end,
    jsonb_build_object('class_id', p_class, 'period_id', p_period, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function public.certify_class(uuid, uuid), public.unlock_class(uuid, uuid, text) from public, anon;
grant execute on function public.certify_class(uuid, uuid), public.unlock_class(uuid, uuid, text) to authenticated;

-- Une classe certifiée : un professeur ne « rouvre » plus ses moyennes.
create or replace function app.assignment_class_certified(p_assignment uuid, p_period uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from teaching_assignments ta
    left join group_classes gc on gc.group_id = ta.group_id
    where ta.id = p_assignment
      and app.class_certified(coalesce(ta.class_id, gc.class_id), p_period)
  )
$$;
grant execute on function app.assignment_class_certified(uuid, uuid) to authenticated, service_role;

drop policy if exists average_completions_delete on average_completions;
create policy average_completions_delete on average_completions for delete to authenticated
using (
  (app.owns_assignment(teaching_assignment_id)
   and app.term_phase(academic_period_id, app.school_today(school_id)) <> 'FROZEN'
   and not app.assignment_class_certified(teaching_assignment_id, academic_period_id))
  or app.can_write(school_id, 'academic_years.manage')
);

-- -----------------------------------------------------------------------------
-- 7. Journal de fin de trimestre d'une classe
-- -----------------------------------------------------------------------------
create or replace function public.term_journal(p_class uuid, p_period uuid)
returns table (created_at timestamptz, actor text, action text, before jsonb, after jsonb,
               student text, subject text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select l.created_at,
         coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), u.display_name, 'Système'),
         l.action, l.before, l.after,
         (select st.last_name || ' ' || st.first_name from students st where st.id = (l.after->>'student_id')::uuid),
         (select s.name from subjects s where s.id = (l.after->>'subject_id')::uuid)
  from audit_logs l
  left join users u on u.id = l.actor_user_id
  where l.school_id = (select school_id from classes where id = p_class)
    and l.module = 'grades'
    and (
      (l.after->>'class_id')::uuid = p_class and (l.after->>'period_id')::uuid = p_period
      or (l.action like 'grades.exemption_%' and l.entity_id in (
            select se.student_id from student_enrollments se where se.class_id = p_class))
      or (l.action = 'grades.completion' and (l.after->>'period_id')::uuid = p_period and l.entity_id in (
            select x.assignment_id from app.class_assignments(p_class, p_period) x))
    )
    and (app.is_platform_admin()
         or app.can_read(l.school_id, 'grades.term_journal')
         or app.is_head_teacher_of(p_class))
  order by l.created_at desc
  limit 2000
$$;
grant execute on function public.term_journal(uuid, uuid) to authenticated;
