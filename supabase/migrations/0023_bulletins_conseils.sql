-- =============================================================================
-- 0023 — Bulletins et conseils de classe
-- =============================================================================

create type report_card_status   as enum ('DRAFT', 'GENERATED', 'VALIDATED', 'PUBLISHED');
create type council_status       as enum ('PLANNED', 'HELD', 'CLOSED');
create type council_decision     as enum ('PROMOTED', 'REPEAT', 'CONDITIONAL', 'EXCLUDED', 'PENDING');
create type council_distinction  as enum (
  'CONGRATULATIONS', 'ENCOURAGEMENTS', 'HONOUR_ROLL', 'WARNING_WORK', 'WARNING_CONDUCT', 'NONE'
);

create table report_card_templates (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  name       text not null,
  layout     jsonb not null default '{}'::jsonb,
  includes   jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_card_templates_layout_is_object check (jsonb_typeof(layout) = 'object')
);

create unique index report_card_templates_default_key
  on report_card_templates (school_id) where is_default;
create index report_card_templates_school_idx on report_card_templates (school_id);

create trigger report_card_templates_touch before update on report_card_templates
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- report_cards
--
-- Les valeurs sont GELEES a la generation. Un bulletin publie doit rester
-- lisible a l'identique dans dix ans, meme si la matiere est renommee, le
-- coefficient modifie ou l'enseignant remplace. Recalculer a l'affichage
-- produirait un document different de celui qui a ete remis a la famille.
-- -----------------------------------------------------------------------------

create table report_cards (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  academic_year_id    uuid not null references academic_years(id) on delete cascade,
  academic_period_id  uuid not null references academic_periods(id) on delete restrict,
  student_id          uuid not null references students(id) on delete cascade,
  class_id            uuid not null references classes(id) on delete restrict,
  template_id         uuid references report_card_templates(id) on delete set null,

  status              report_card_status not null default 'DRAFT',
  general_average     numeric(8,3),
  rank                integer,
  class_size          integer,
  class_average       numeric(8,3),

  decision            council_decision,
  distinction         council_distinction not null default 'NONE',
  head_teacher_comment text,
  council_comment     text,

  absences_count      integer not null default 0,
  lateness_count      integer not null default 0,

  pdf_document_id     uuid,
  generated_at        timestamptz,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (student_id, academic_period_id)
);

create index report_cards_class_idx
  on report_cards (school_id, academic_period_id, class_id, status);
create index report_cards_student_idx on report_cards (student_id);

create trigger report_cards_touch before update on report_cards
  for each row execute function app.touch_updated_at();

create table report_card_items (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  report_card_id        uuid not null references report_cards(id) on delete cascade,
  subject_id            uuid references subjects(id) on delete set null,

  -- Instantanes : le bulletin survit au renommage de la matiere ou au depart
  -- de l'enseignant
  subject_name_snapshot text not null,
  teacher_name_snapshot text,

  coefficient           numeric(6,2) not null default 1,
  average               numeric(8,3),
  weighted_points       numeric(10,3),
  class_average         numeric(8,3),
  class_min             numeric(8,3),
  class_max             numeric(8,3),
  rank                  integer,
  appreciation          text,
  sequence              integer not null default 0
);

-- Une contrainte UNIQUE inline n'accepte pas d'expression : coalesce impose un
-- index unique separe. subject_id est nullable (ligne de synthese, conduite,
-- appreciation generale), d'ou le coalesce.
create unique index report_card_items_key
  on report_card_items (
    report_card_id,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index report_card_items_card_idx on report_card_items (report_card_id, sequence);
create index report_card_items_school_idx on report_card_items (school_id);

-- -----------------------------------------------------------------------------
-- Conseils de classe
-- -----------------------------------------------------------------------------

create table class_councils (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete restrict,
  class_id           uuid not null references classes(id) on delete cascade,

  scheduled_at       timestamptz,
  held_at            timestamptz,
  chaired_by         uuid references users(id) on delete set null,
  status             council_status not null default 'PLANNED',
  minutes            text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (class_id, academic_period_id)
);

create index class_councils_school_idx on class_councils (school_id, academic_period_id);

create trigger class_councils_touch before update on class_councils
  for each row execute function app.touch_updated_at();

create table class_council_decisions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  council_id  uuid not null references class_councils(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,

  decision    council_decision not null default 'PENDING',
  distinction council_distinction not null default 'NONE',
  comment     text,
  decided_by  uuid references users(id) on delete set null,
  decided_at  timestamptz,

  unique (council_id, student_id)
);

create index council_decisions_student_idx on class_council_decisions (student_id);
create index council_decisions_school_idx on class_council_decisions (school_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table report_card_templates enable row level security;
alter table report_card_templates force  row level security;

create policy report_templates_select on report_card_templates for select to authenticated
using (app.can_read(school_id, 'reports.view'));
create policy report_templates_insert on report_card_templates for insert to authenticated
with check (app.can_write(school_id, 'reports.manage_templates'));
create policy report_templates_update on report_card_templates for update to authenticated
using (app.can_write(school_id, 'reports.manage_templates'))
with check (app.can_write(school_id, 'reports.manage_templates'));
create policy report_templates_delete on report_card_templates for delete to authenticated
using (app.can_write(school_id, 'reports.manage_templates'));

alter table report_cards enable row level security;
alter table report_cards force  row level security;

-- Les familles ne voient le bulletin qu'une fois PUBLIE
create policy report_cards_select on report_cards for select to authenticated
using (
  app.can_read(school_id, 'reports.view')
  or (status = 'PUBLISHED' and app.can_see_student(school_id, student_id))
);

create policy report_cards_insert on report_cards for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'reports.generate'));
create policy report_cards_update on report_cards for update to authenticated
using (app.can_write(school_id, 'reports.validate'))
with check (app.can_write(school_id, 'reports.validate'));
create policy report_cards_delete on report_cards for delete to authenticated
using (app.can_write(school_id, 'reports.generate'));

alter table report_card_items enable row level security;
alter table report_card_items force  row level security;

create policy report_items_select on report_card_items for select to authenticated
using (
  exists (
    select 1 from report_cards rc
    where rc.id = report_card_items.report_card_id
      and (app.can_read(rc.school_id, 'reports.view')
           or (rc.status = 'PUBLISHED' and app.can_see_student(rc.school_id, rc.student_id)))
  )
);
create policy report_items_insert on report_card_items for insert to authenticated
with check (app.can_write(school_id, 'reports.generate'));
create policy report_items_update on report_card_items for update to authenticated
using (app.can_write(school_id, 'reports.generate'))
with check (app.can_write(school_id, 'reports.generate'));
create policy report_items_delete on report_card_items for delete to authenticated
using (app.can_write(school_id, 'reports.generate'));

alter table class_councils enable row level security;
alter table class_councils force  row level security;

create policy councils_select on class_councils for select to authenticated
using (app.can_read(school_id, 'councils.view') or app.teaches_class(class_id));
create policy councils_insert on class_councils for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'councils.manage'));
create policy councils_update on class_councils for update to authenticated
using (app.can_write(school_id, 'councils.manage')) with check (app.can_write(school_id, 'councils.manage'));
create policy councils_delete on class_councils for delete to authenticated
using (app.can_write(school_id, 'councils.manage'));

alter table class_council_decisions enable row level security;
alter table class_council_decisions force  row level security;

create policy council_decisions_select on class_council_decisions for select to authenticated
using (app.can_read(school_id, 'councils.view') or app.can_see_student(school_id, student_id));
create policy council_decisions_insert on class_council_decisions for insert to authenticated
with check (app.can_write(school_id, 'councils.decide'));
create policy council_decisions_update on class_council_decisions for update to authenticated
using (app.can_write(school_id, 'councils.decide')) with check (app.can_write(school_id, 'councils.decide'));
create policy council_decisions_delete on class_council_decisions for delete to authenticated
using (app.can_write(school_id, 'councils.decide'));

grant select, insert, update, delete on
  report_card_templates, report_cards, report_card_items,
  class_councils, class_council_decisions
to authenticated;
