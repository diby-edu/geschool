-- =============================================================================
-- 0015 — Affectations pedagogiques et perimetre enseignant
-- =============================================================================
--
-- teaching_assignments repond a « qui enseigne quoi, a qui, combien d'heures ».
-- C'est aussi la source du perimetre d'un enseignant : ses classes, ses
-- groupes, ses matieres sont DEDUITS de cette table, jamais saisis a la main.
-- L'organisation change, le perimetre suit sans intervention.

create type assignment_status as enum ('DRAFT', 'ACTIVE', 'ENDED');

create table teaching_assignments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,

  teacher_id         uuid not null references teachers(id) on delete cascade,
  subject_id         uuid not null references subjects(id) on delete restrict,

  -- L'un des deux au moins est renseigne
  class_id           uuid references classes(id) on delete cascade,
  group_id           uuid references groups(id) on delete cascade,

  weekly_minutes     integer not null default 0,
  -- NULL = toute l'annee ; renseigne pour une affectation limitee a une periode
  academic_period_id uuid references academic_periods(id) on delete set null,

  status             assignment_status not null default 'ACTIVE',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint teaching_assignments_target
    check (class_id is not null or group_id is not null),
  constraint teaching_assignments_minutes_positive check (weekly_minutes >= 0)
);

-- Le cas du §31 — Professeur A 3 h et Professeur B 2 h sur la meme classe et
-- la meme matiere — donne DEUX affectations distinctes. L'unicite porte donc
-- sur (enseignant, matiere, cible, periode), pas sur (matiere, cible).
create unique index teaching_assignments_key
  on teaching_assignments (
    academic_year_id,
    teacher_id,
    subject_id,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(academic_period_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index teaching_assignments_teacher_idx
  on teaching_assignments (teacher_id, academic_year_id, status);
create index teaching_assignments_class_idx
  on teaching_assignments (class_id, academic_year_id) where class_id is not null;
create index teaching_assignments_group_idx
  on teaching_assignments (group_id, academic_year_id) where group_id is not null;
create index teaching_assignments_school_idx
  on teaching_assignments (school_id, academic_year_id);

create trigger teaching_assignments_touch before update on teaching_assignments
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Perimetre derive — enseignant
-- -----------------------------------------------------------------------------

create or replace function app.teaches_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.teachers t on t.id = ta.teacher_id
    where ta.class_id = p_class
      and ta.status = 'ACTIVE'
      and t.user_id = auth.uid()
      and t.deleted_at is null
  )
  or app.is_head_teacher_of(p_class);
$$;

create or replace function app.teaches_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.teachers t on t.id = ta.teacher_id
    where ta.group_id = p_group
      and ta.status = 'ACTIVE'
      and t.user_id = auth.uid()
      and t.deleted_at is null
  );
$$;

-- Classes sur lesquelles j'interviens, comme enseignant ou comme professeur
-- principal. Utilise par les ecrans de liste plutot que par les policies.
create or replace function app.my_class_ids(p_school uuid)
returns uuid[]
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(array_agg(distinct cid), '{}'::uuid[])
  from (
    select ta.class_id as cid
    from public.teaching_assignments ta
    join public.teachers t on t.id = ta.teacher_id
    where t.user_id = auth.uid() and t.deleted_at is null
      and ta.school_id = p_school and ta.status = 'ACTIVE'
      and ta.class_id is not null
    union
    select gc.class_id
    from public.teaching_assignments ta
    join public.teachers t on t.id = ta.teacher_id
    join public.group_classes gc on gc.group_id = ta.group_id
    where t.user_id = auth.uid() and t.deleted_at is null
      and ta.school_id = p_school and ta.status = 'ACTIVE'
      and ta.group_id is not null
    union
    select c.id
    from public.classes c
    join public.teachers t on t.id = c.head_teacher_id
    where t.user_id = auth.uid() and t.deleted_at is null
      and c.school_id = p_school
  ) t
  where cid is not null;
$$;

-- Est-ce que j'enseigne a cet eleve ? Vrai si sa classe de l'annee ou l'un de
-- ses groupes m'est affecte.
create or replace function app.teaches_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.student_enrollments se
    join public.teaching_assignments ta
      on ta.class_id = se.class_id
     and ta.academic_year_id = se.academic_year_id
    join public.teachers t on t.id = ta.teacher_id
    where se.student_id = p_student
      and se.status = 'ENROLLED'
      and ta.status = 'ACTIVE'
      and t.user_id = auth.uid()
      and t.deleted_at is null
  )
  or exists (
    select 1
    from public.student_groups sg
    join public.teaching_assignments ta
      on ta.group_id = sg.group_id
     and ta.academic_year_id = sg.academic_year_id
    join public.teachers t on t.id = ta.teacher_id
    where sg.student_id = p_student
      and sg.left_at is null
      and ta.status = 'ACTIVE'
      and t.user_id = auth.uid()
      and t.deleted_at is null
  )
  or exists (
    select 1
    from public.student_enrollments se
    join public.classes c on c.id = se.class_id
    join public.teachers t on t.id = c.head_teacher_id
    where se.student_id = p_student
      and se.status = 'ENROLLED'
      and t.user_id = auth.uid()
      and t.deleted_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Completion de app.can_see_student
--
-- Meme signature, donc meme OID : les policies de la migration 0014 prennent
-- ce nouveau corps sans avoir a etre recreees.
-- -----------------------------------------------------------------------------

create or replace function app.can_see_student(p_school uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school) and app.has_permission(p_school, 'students.view'))
      or app.is_guardian_of(p_student)
      or app.is_self_student(p_student)
      or app.teaches_student(p_student);
$$;

grant execute on function
  app.teaches_class(uuid),
  app.teaches_group(uuid),
  app.my_class_ids(uuid),
  app.teaches_student(uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table teaching_assignments enable row level security;
alter table teaching_assignments force  row level security;

create policy assignments_select on teaching_assignments for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy assignments_insert on teaching_assignments for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'assignments.manage'));

create policy assignments_update on teaching_assignments for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'assignments.manage'))
with check (app.can_write_year(school_id, academic_year_id, 'assignments.manage'));

create policy assignments_delete on teaching_assignments for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'assignments.manage'));

grant select, insert, update, delete on teaching_assignments to authenticated;
