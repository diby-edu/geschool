-- =============================================================================
-- 0010 — Matieres et programme par niveau
-- =============================================================================

create table subjects (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  code                text not null,
  name                text not null,
  short_name          text,
  description         text not null default '',
  category            text,
  color               text,
  default_coefficient numeric(6,2) not null default 1,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (school_id, code),
  constraint subjects_coefficient_positive check (default_coefficient > 0),
  constraint subjects_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

create index subjects_school_idx on subjects (school_id, is_active, name);

create trigger subjects_touch before update on subjects
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- level_subjects — le programme par niveau
--
-- Gabarit a partir duquel les exigences pedagogiques d'une classe sont
-- proposees. C'est ici que vit « en 4e, les maths pesent coefficient 4 et
-- 4 heures par semaine », pas dans subjects : le meme enseignement n'a pas le
-- meme poids d'un niveau a l'autre.
-- -----------------------------------------------------------------------------

create table level_subjects (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  level_id       uuid not null references levels(id) on delete cascade,
  subject_id     uuid not null references subjects(id) on delete cascade,
  coefficient    numeric(6,2) not null default 1,
  weekly_minutes integer not null default 0,
  is_mandatory   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (level_id, subject_id),
  constraint level_subjects_coefficient_positive check (coefficient > 0),
  constraint level_subjects_minutes_positive check (weekly_minutes >= 0)
);

create index level_subjects_school_idx on level_subjects (school_id);
create index level_subjects_subject_idx on level_subjects (subject_id);

create trigger level_subjects_touch before update on level_subjects
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table subjects enable row level security;
alter table subjects force  row level security;

create policy subjects_select on subjects for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy subjects_insert on subjects for insert to authenticated
with check (app.can_write(school_id, 'subjects.create'));

create policy subjects_update on subjects for update to authenticated
using (app.can_write(school_id, 'subjects.update'))
with check (app.can_write(school_id, 'subjects.update'));

create policy subjects_delete on subjects for delete to authenticated
using (app.can_write(school_id, 'subjects.delete'));

alter table level_subjects enable row level security;
alter table level_subjects force  row level security;

create policy level_subjects_select on level_subjects for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy level_subjects_insert on level_subjects for insert to authenticated
with check (app.can_write(school_id, 'subjects.update'));

create policy level_subjects_update on level_subjects for update to authenticated
using (app.can_write(school_id, 'subjects.update'))
with check (app.can_write(school_id, 'subjects.update'));

create policy level_subjects_delete on level_subjects for delete to authenticated
using (app.can_write(school_id, 'subjects.update'));

grant select, insert, update, delete on subjects, level_subjects to authenticated;
