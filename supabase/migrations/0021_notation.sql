-- =============================================================================
-- 0021 — Baremes, evaluations, notes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Correctif de securite sur la vue de la migration 0020
--
-- Une vue PostgreSQL s'execute par defaut avec les droits de SON PROPRIETAIRE.
-- v_lateness_records, creee par postgres, contournait donc la RLS de
-- attendance_records : n'importe quel utilisateur authentifie y aurait lu les
-- retards de tous les etablissements.
--
-- security_invoker = true fait appliquer la RLS de l'APPELANT. Toute vue de ce
-- projet doit porter cette option.
-- -----------------------------------------------------------------------------

alter view v_lateness_records set (security_invoker = true);

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------

create type grading_scale_kind as enum ('NUMERIC', 'LETTER');
create type rounding_mode      as enum ('NONE', 'HALF_UP', 'NEAREST_HALF', 'NEAREST_QUARTER', 'FLOOR', 'CEIL');
create type assessment_status  as enum ('DRAFT', 'OPEN', 'CLOSED', 'PUBLISHED');

-- -----------------------------------------------------------------------------
-- grading_scales — /20 n'est qu'un defaut de seed (§39)
-- -----------------------------------------------------------------------------

create table grading_scales (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  code          text not null,
  name          text not null,
  kind          grading_scale_kind not null default 'NUMERIC',
  min_score     numeric(8,3) not null default 0,
  max_score     numeric(8,3) not null default 20,
  decimals      smallint not null default 2,
  rounding      rounding_mode not null default 'HALF_UP',
  passing_score numeric(8,3) not null default 10,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (school_id, code),
  constraint grading_scales_range check (max_score > min_score),
  constraint grading_scales_passing check (passing_score between min_score and max_score),
  constraint grading_scales_decimals check (decimals between 0 and 4)
);

create unique index grading_scales_default_key
  on grading_scales (school_id) where is_default;

create trigger grading_scales_touch before update on grading_scales
  for each row execute function app.touch_updated_at();

-- Bandes d'une echelle lettree (A, B, C… ou Tres bien, Bien…) et mentions
create table grading_scale_bands (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  scale_id           uuid not null references grading_scales(id) on delete cascade,
  label              text not null,
  min_value          numeric(8,3) not null,
  max_value          numeric(8,3) not null,
  numeric_equivalent numeric(8,3),
  sequence           integer not null default 0,

  constraint grading_scale_bands_range check (max_value >= min_value)
);

create index grading_scale_bands_scale_idx on grading_scale_bands (scale_id, sequence);
create index grading_scale_bands_school_idx on grading_scale_bands (school_id);

-- -----------------------------------------------------------------------------
-- assessment_types — configurables par etablissement (§38)
-- -----------------------------------------------------------------------------

create table assessment_types (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  code                text not null,
  name                text not null,
  default_coefficient numeric(6,2) not null default 1,
  counts_in_average   boolean not null default true,
  sequence            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (school_id, code),
  constraint assessment_types_coefficient_positive check (default_coefficient > 0)
);

create index assessment_types_school_idx on assessment_types (school_id, sequence);

create trigger assessment_types_touch before update on assessment_types
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- assessments
-- -----------------------------------------------------------------------------

create table assessments (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  academic_year_id      uuid not null references academic_years(id) on delete cascade,
  academic_period_id    uuid not null references academic_periods(id) on delete restrict,

  subject_id            uuid not null references subjects(id) on delete restrict,
  class_id              uuid references classes(id) on delete cascade,
  group_id              uuid references groups(id) on delete cascade,
  teacher_id            uuid references teachers(id) on delete set null,
  assessment_type_id    uuid not null references assessment_types(id) on delete restrict,

  title                 text not null,
  assessment_date       date not null default current_date,
  grading_scale_id      uuid not null references grading_scales(id) on delete restrict,
  max_score             numeric(8,3) not null,
  coefficient           numeric(6,2) not null default 1,

  is_eliminatory        boolean not null default false,
  eliminatory_threshold numeric(8,3),

  status                assessment_status not null default 'DRAFT',
  published_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references users(id) on delete set null,

  constraint assessments_target check (class_id is not null or group_id is not null),
  constraint assessments_max_score_positive check (max_score > 0),
  constraint assessments_coefficient_positive check (coefficient > 0),
  constraint assessments_eliminatory_coherent
    check (not is_eliminatory or eliminatory_threshold is not null)
);

create index assessments_period_idx
  on assessments (school_id, academic_period_id, subject_id);
create index assessments_class_idx on assessments (class_id) where class_id is not null;
create index assessments_group_idx on assessments (group_id) where group_id is not null;
create index assessments_teacher_idx on assessments (teacher_id) where teacher_id is not null;

create trigger assessments_touch before update on assessments
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- grades
--
-- Pas de table d'historique dediee : toute modification est tracee dans
-- audit_logs avec l'etat avant et apres (§52). Une seule verite (§3).
-- -----------------------------------------------------------------------------

create table grades (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references schools(id) on delete cascade,
  assessment_id             uuid not null references assessments(id) on delete cascade,
  student_id                uuid not null references students(id) on delete cascade,

  score                     numeric(8,3),
  letter                    text,
  is_absent                 boolean not null default false,
  is_excused                boolean not null default false,
  is_excluded_from_average  boolean not null default false,
  comment                   text,

  entered_by                uuid references users(id) on delete set null,
  entered_at                timestamptz not null default now(),
  updated_by                uuid references users(id) on delete set null,
  updated_at                timestamptz not null default now(),

  unique (assessment_id, student_id),
  -- Une note absente n'a pas de score, et reciproquement une note presente en a un
  constraint grades_score_or_absent check (
    (is_absent and score is null) or (not is_absent and (score is not null or letter is not null))
  ),
  constraint grades_score_positive check (score is null or score >= 0)
);

create index grades_student_idx on grades (school_id, student_id);
create index grades_assessment_idx on grades (assessment_id);

create trigger grades_touch before update on grades
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Visibilite d'une evaluation
-- -----------------------------------------------------------------------------

create or replace function app.owns_assessment(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.assessments a
    join public.teachers t on t.id = a.teacher_id
    where a.id = p_assessment
      and t.user_id = auth.uid()
      and t.deleted_at is null
  );
$$;

grant execute on function app.owns_assessment(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table grading_scales enable row level security;
alter table grading_scales force  row level security;

create policy grading_scales_select on grading_scales for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy grading_scales_insert on grading_scales for insert to authenticated
with check (app.can_write(school_id, 'grading.manage_scales'));
create policy grading_scales_update on grading_scales for update to authenticated
using (app.can_write(school_id, 'grading.manage_scales'))
with check (app.can_write(school_id, 'grading.manage_scales'));
create policy grading_scales_delete on grading_scales for delete to authenticated
using (app.can_write(school_id, 'grading.manage_scales'));

alter table grading_scale_bands enable row level security;
alter table grading_scale_bands force  row level security;

create policy scale_bands_select on grading_scale_bands for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy scale_bands_insert on grading_scale_bands for insert to authenticated
with check (app.can_write(school_id, 'grading.manage_scales'));
create policy scale_bands_update on grading_scale_bands for update to authenticated
using (app.can_write(school_id, 'grading.manage_scales'))
with check (app.can_write(school_id, 'grading.manage_scales'));
create policy scale_bands_delete on grading_scale_bands for delete to authenticated
using (app.can_write(school_id, 'grading.manage_scales'));

alter table assessment_types enable row level security;
alter table assessment_types force  row level security;

create policy assessment_types_select on assessment_types for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy assessment_types_insert on assessment_types for insert to authenticated
with check (app.can_write(school_id, 'grading.manage_settings'));
create policy assessment_types_update on assessment_types for update to authenticated
using (app.can_write(school_id, 'grading.manage_settings'))
with check (app.can_write(school_id, 'grading.manage_settings'));
create policy assessment_types_delete on assessment_types for delete to authenticated
using (app.can_write(school_id, 'grading.manage_settings'));

alter table assessments enable row level security;
alter table assessments force  row level security;

create policy assessments_select on assessments for select to authenticated
using (
  app.can_read(school_id, 'assessments.view')
  or app.owns_assessment(id)
  or (class_id is not null and app.teaches_class(class_id))
  or (group_id is not null and app.teaches_group(group_id))
  -- Familles : seulement une fois l'evaluation publiee
  or (status = 'PUBLISHED' and exists (
        select 1 from grades g
        where g.assessment_id = assessments.id
          and g.student_id = any (app.my_student_ids(assessments.school_id))
     ))
);

create policy assessments_insert on assessments for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'assessments.create'));

-- Un enseignant modifie SES evaluations. Celles d'un collegue exigent la
-- permission generale, meme sur la meme classe (docs/RBAC.md §6).
create policy assessments_update on assessments for update to authenticated
using (app.owns_assessment(id) or app.can_write(school_id, 'assessments.update'))
with check (app.owns_assessment(id) or app.can_write(school_id, 'assessments.update'));

create policy assessments_delete on assessments for delete to authenticated
using (app.owns_assessment(id) or app.can_write(school_id, 'assessments.delete'));

alter table grades enable row level security;
alter table grades force  row level security;

create policy grades_select on grades for select to authenticated
using (
  app.can_read(school_id, 'grades.view_all')
  or app.owns_assessment(assessment_id)
  -- L'eleve et ses parents ne voient la note qu'une fois publiee
  or (
    app.can_see_student(school_id, student_id)
    and (
      app.has_permission(school_id, 'grades.view')
      or exists (select 1 from assessments a
                 where a.id = grades.assessment_id and a.status = 'PUBLISHED')
    )
  )
);

create policy grades_insert on grades for insert to authenticated
with check (app.owns_assessment(assessment_id) or app.can_write(school_id, 'grades.create'));

-- Apres validation, l'enseignant ne peut plus modifier : seul un porteur de
-- grades.update au perimetre etablissement intervient, et c'est audite.
create policy grades_update on grades for update to authenticated
using (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id)
      and exists (select 1 from assessments a
                  where a.id = grades.assessment_id and a.status in ('DRAFT', 'OPEN')))
)
with check (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id)
      and exists (select 1 from assessments a
                  where a.id = grades.assessment_id and a.status in ('DRAFT', 'OPEN')))
);

create policy grades_delete on grades for delete to authenticated
using (app.can_write(school_id, 'grades.delete'));

grant select, insert, update, delete on
  grading_scales, grading_scale_bands, assessment_types, assessments, grades
to authenticated;
