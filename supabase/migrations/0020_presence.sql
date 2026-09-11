-- =============================================================================
-- 0020 — Presence : appel, absences, retards, justificatifs
-- =============================================================================
--
-- L'appel s'attache a une OCCURRENCE datee, jamais a la trame (ADR-002, §40).
--
-- ADR-011 : pas de table lateness_records. Un retard est un
-- attendance_records.status = 'LATE' avec minutes_late. Une table separee
-- creerait deux verites sur la presence. La vue v_lateness_records restitue
-- la lecture attendue par le §40.

create type attendance_register_status as enum ('OPEN', 'SUBMITTED', 'VALIDATED');
create type attendance_status          as enum ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
create type justification_status       as enum ('PENDING', 'APPROVED', 'REJECTED');

-- -----------------------------------------------------------------------------
-- attendance_registers — un appel, une occurrence
-- -----------------------------------------------------------------------------

create table attendance_registers (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  session_occurrence_id uuid not null references session_occurrences(id) on delete cascade,

  taken_by              uuid references users(id) on delete set null,
  taken_at              timestamptz not null default now(),
  status                attendance_register_status not null default 'OPEN',
  validated_by          uuid references users(id) on delete set null,
  validated_at          timestamptz,

  -- Idempotence hors ligne : rejouer dix fois la synchronisation ne cree
  -- qu'un seul registre (docs/OFFLINE_SYNC.md §4)
  client_operation_id   uuid,
  source                write_source not null default 'ONLINE',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Double barriere : un cours ne peut avoir qu'un appel, et une operation
  -- cliente ne peut en creer qu'un.
  unique (session_occurrence_id)
);

create unique index attendance_registers_client_op_key
  on attendance_registers (school_id, client_operation_id)
  where client_operation_id is not null;
create index attendance_registers_school_idx
  on attendance_registers (school_id, taken_at desc);

create trigger attendance_registers_touch before update on attendance_registers
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- attendance_records
-- -----------------------------------------------------------------------------

create table attendance_records (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  register_id  uuid not null references attendance_registers(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,

  status       attendance_status not null default 'PRESENT',
  minutes_late integer not null default 0,
  comment      text,

  recorded_by  uuid references users(id) on delete set null,
  recorded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (register_id, student_id),
  constraint attendance_records_minutes_late check (minutes_late >= 0),
  -- Un retard sans duree n'est pas exploitable statistiquement
  constraint attendance_records_late_has_minutes
    check (status <> 'LATE' or minutes_late > 0)
);

create index attendance_records_student_idx
  on attendance_records (school_id, student_id, recorded_at desc);
create index attendance_records_register_idx on attendance_records (register_id);
create index attendance_records_absences_idx
  on attendance_records (school_id, status, recorded_at desc)
  where status in ('ABSENT', 'LATE');

create trigger attendance_records_touch before update on attendance_records
  for each row execute function app.touch_updated_at();

-- Vue attendue par le §40, derivee et non dupliquee (ADR-011)
create view v_lateness_records as
  select id, school_id, register_id, student_id, minutes_late, comment,
         recorded_by, recorded_at
  from attendance_records
  where status = 'LATE';

-- -----------------------------------------------------------------------------
-- absence_justifications
-- -----------------------------------------------------------------------------

create table absence_justifications (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,

  covers_from      date not null,
  covers_to        date not null,
  reason           text not null,
  document_id      uuid,

  submitted_by     uuid references users(id) on delete set null,
  status           justification_status not null default 'PENDING',
  decided_by       uuid references users(id) on delete set null,
  decided_at       timestamptz,
  decision_comment text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint absence_justifications_range check (covers_to >= covers_from)
);

create index absence_justifications_student_idx
  on absence_justifications (student_id, covers_from desc);
create index absence_justifications_school_idx
  on absence_justifications (school_id, status);

create trigger absence_justifications_touch before update on absence_justifications
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Peut-on faire l'appel de cette occurrence ?
-- L'enseignant de la seance, ou un porteur d'attendance.create.
-- -----------------------------------------------------------------------------

create or replace function app.can_take_attendance(p_school uuid, p_occurrence uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school)
          and app.school_is_writable(p_school)
          and (
            app.has_permission(p_school, 'attendance.create')
            or exists (
              select 1
              from public.session_occurrences o
              join public.schedule_session_teachers st on st.session_id = o.schedule_session_id
              join public.teachers t on t.id = st.teacher_id
              where o.id = p_occurrence
                and t.user_id = auth.uid()
                and t.deleted_at is null
            )
            or exists (
              select 1
              from public.session_occurrences o
              join public.teachers t on t.id = o.override_teacher_id
              where o.id = p_occurrence and t.user_id = auth.uid()
            )
          ));
$$;

grant execute on function app.can_take_attendance(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table attendance_registers enable row level security;
alter table attendance_registers force  row level security;

create policy registers_select on attendance_registers for select to authenticated
using (
  app.can_read(school_id, 'attendance.view_all')
  or app.can_see_session(school_id,
       (select o.schedule_session_id from session_occurrences o where o.id = session_occurrence_id))
);

create policy registers_insert on attendance_registers for insert to authenticated
with check (app.can_take_attendance(school_id, session_occurrence_id));

create policy registers_update on attendance_registers for update to authenticated
using (app.can_take_attendance(school_id, session_occurrence_id)
       or app.can_write(school_id, 'attendance.validate'))
with check (app.can_take_attendance(school_id, session_occurrence_id)
       or app.can_write(school_id, 'attendance.validate'));

create policy registers_delete on attendance_registers for delete to authenticated
using (app.can_write(school_id, 'attendance.validate'));

alter table attendance_records enable row level security;
alter table attendance_records force  row level security;

create policy attendance_records_select on attendance_records for select to authenticated
using (app.can_see_student(school_id, student_id));

create policy attendance_records_insert on attendance_records for insert to authenticated
with check (
  exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and app.can_take_attendance(r.school_id, r.session_occurrence_id)
  )
);

create policy attendance_records_update on attendance_records for update to authenticated
using (
  app.can_write(school_id, 'attendance.update')
  or exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and r.status = 'OPEN'
      and app.can_take_attendance(r.school_id, r.session_occurrence_id)
  )
)
with check (
  app.can_write(school_id, 'attendance.update')
  or exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and r.status = 'OPEN'
      and app.can_take_attendance(r.school_id, r.session_occurrence_id)
  )
);

create policy attendance_records_delete on attendance_records for delete to authenticated
using (app.can_write(school_id, 'attendance.update'));

alter table absence_justifications enable row level security;
alter table absence_justifications force  row level security;

-- Un parent depose et consulte les justificatifs de ses enfants
create policy justifications_select on absence_justifications for select to authenticated
using (app.can_see_student(school_id, student_id));

create policy justifications_insert on absence_justifications for insert to authenticated
with check (
  app.is_guardian_of(student_id)
  or app.can_write(school_id, 'attendance.justify')
);

create policy justifications_update on absence_justifications for update to authenticated
using (app.can_write(school_id, 'attendance.justify'))
with check (app.can_write(school_id, 'attendance.justify'));

create policy justifications_delete on absence_justifications for delete to authenticated
using (app.can_write(school_id, 'attendance.justify'));

grant select, insert, update, delete on
  attendance_registers, attendance_records, absence_justifications
to authenticated;
grant select on v_lateness_records to authenticated;
