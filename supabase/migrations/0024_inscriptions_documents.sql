-- =============================================================================
-- 0024 — Candidatures, transferts, documents
-- =============================================================================

create type application_status   as enum (
  'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ENROLLED', 'CANCELLED'
);
create type document_owner_type  as enum ('STUDENT', 'GUARDIAN', 'TEACHER', 'CLASS', 'SCHOOL');
create type document_visibility  as enum ('PRIVATE', 'SCHOOL', 'OWNER', 'GUARDIANS');

-- -----------------------------------------------------------------------------
-- applications — le dossier de candidature
--
-- Le passage ACCEPTED -> ENROLLED declenche l'orchestration complete decrite
-- dans docs/ACCESS_MANAGEMENT.md §3 : eleve, responsables, comptes, envois.
-- -----------------------------------------------------------------------------

create table applications (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  academic_year_id    uuid not null references academic_years(id) on delete cascade,

  reference           text not null,
  applicant           jsonb not null default '{}'::jsonb,
  requested_level_id  uuid references levels(id) on delete set null,

  status              application_status not null default 'SUBMITTED',
  reviewed_by         uuid references users(id) on delete set null,
  reviewed_at         timestamptz,
  decision_comment    text,
  enrolled_student_id uuid references students(id) on delete set null,

  -- Idempotence de la synchronisation hors ligne (docs/OFFLINE_SYNC.md §7)
  client_operation_id uuid,
  source              write_source not null default 'ONLINE',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (school_id, reference),
  constraint applications_applicant_is_object check (jsonb_typeof(applicant) = 'object')
);

create unique index applications_client_op_key
  on applications (school_id, client_operation_id) where client_operation_id is not null;
create index applications_status_idx
  on applications (school_id, academic_year_id, status);

create trigger applications_touch before update on applications
  for each row execute function app.touch_updated_at();

create table student_transfers (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  from_class_id    uuid references classes(id) on delete set null,
  to_class_id      uuid references classes(id) on delete set null,
  effective_on     date not null default current_date,
  reason           text,
  decided_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index student_transfers_student_idx on student_transfers (student_id, effective_on desc);
create index student_transfers_school_idx on student_transfers (school_id);

-- -----------------------------------------------------------------------------
-- documents
--
-- Arborescence de stockage imposee : schools/{school_id}/... (ARCHITECTURE §4).
-- Les policies Storage lisent le deuxieme segment du chemin et appliquent
-- exactement les memes fonctions d'appartenance que les tables.
-- -----------------------------------------------------------------------------

create table document_categories (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  applies_to document_owner_type,
  created_at timestamptz not null default now(),

  unique (school_id, code)
);

create index document_categories_school_idx on document_categories (school_id);

create table documents (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  category_id  uuid references document_categories(id) on delete set null,

  owner_type   document_owner_type not null,
  owner_id     uuid,

  name         text not null,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  checksum     text,
  visibility   document_visibility not null default 'PRIVATE',

  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint documents_size_positive check (size_bytes >= 0),
  -- Verrou structurel : un chemin hors du prefixe de l'etablissement est
  -- refuse par la base, pas seulement par le code applicatif.
  constraint documents_path_scoped
    check (storage_path like 'schools/' || school_id::text || '/%')
);

create index documents_owner_idx on documents (school_id, owner_type, owner_id);
create index documents_category_idx on documents (category_id) where category_id is not null;

create trigger documents_touch before update on documents
  for each row execute function app.touch_updated_at();

-- Cle etrangere differee depuis la migration 0020 : documents n'existait pas
-- encore lorsque absence_justifications a ete creee.
alter table absence_justifications
  add constraint absence_justifications_document_fk
  foreign key (document_id) references documents(id) on delete set null;

alter table report_cards
  add constraint report_cards_pdf_document_fk
  foreign key (pdf_document_id) references documents(id) on delete set null;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table applications enable row level security;
alter table applications force  row level security;

create policy applications_select on applications for select to authenticated
using (app.can_read(school_id, 'applications.view'));
create policy applications_insert on applications for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'applications.review'));
create policy applications_update on applications for update to authenticated
using (app.can_write(school_id, 'applications.review'))
with check (app.can_write(school_id, 'applications.review'));
create policy applications_delete on applications for delete to authenticated
using (app.can_write(school_id, 'applications.decide'));

alter table student_transfers enable row level security;
alter table student_transfers force  row level security;

create policy transfers_select on student_transfers for select to authenticated
using (app.can_see_student(school_id, student_id));
create policy transfers_insert on student_transfers for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'enrollments.transfer'));
create policy transfers_update on student_transfers for update to authenticated
using (app.can_write(school_id, 'enrollments.transfer'))
with check (app.can_write(school_id, 'enrollments.transfer'));
create policy transfers_delete on student_transfers for delete to authenticated
using (app.can_write(school_id, 'enrollments.transfer'));

alter table document_categories enable row level security;
alter table document_categories force  row level security;

create policy doc_categories_select on document_categories for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy doc_categories_insert on document_categories for insert to authenticated
with check (app.can_write(school_id, 'documents.upload'));
create policy doc_categories_update on document_categories for update to authenticated
using (app.can_write(school_id, 'documents.upload')) with check (app.can_write(school_id, 'documents.upload'));
create policy doc_categories_delete on document_categories for delete to authenticated
using (app.can_write(school_id, 'documents.delete'));

alter table documents enable row level security;
alter table documents force  row level security;

-- Un document rattache a un eleve suit la visibilite de cet eleve : ses
-- parents y accedent, les autres non.
create policy documents_select on documents for select to authenticated
using (
  app.can_read(school_id, 'documents.view')
  or (owner_type = 'STUDENT' and owner_id is not null
      and visibility in ('OWNER', 'GUARDIANS')
      and app.can_see_student(school_id, owner_id))
  or (visibility = 'SCHOOL' and app.is_member_of(school_id))
);

create policy documents_insert on documents for insert to authenticated
with check (app.can_write(school_id, 'documents.upload'));
create policy documents_update on documents for update to authenticated
using (app.can_write(school_id, 'documents.upload'))
with check (app.can_write(school_id, 'documents.upload'));
create policy documents_delete on documents for delete to authenticated
using (app.can_write(school_id, 'documents.delete'));

grant select, insert, update, delete on
  applications, student_transfers, document_categories, documents
to authenticated;
