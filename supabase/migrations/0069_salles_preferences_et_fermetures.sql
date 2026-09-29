-- =============================================================================
-- 0069 — Salles : préférence par type, et fermeture sur des dates
-- =============================================================================
--
-- Deux manques, relevés en construisant le module des salles.
--
-- 1. Un cours pouvait exiger un TYPE de salle (« laboratoire obligatoire ») ou
--    préférer une SALLE précise, mais pas préférer un TYPE. Or c'est le cas le
--    plus fréquent : « informatique en salle info SI elle est libre, sinon dans
--    la salle habituelle ». Beaucoup d'écoles n'ont pas de salle spécialisée du
--    tout : la préférence doit pouvoir retomber sur une salle ordinaire.
--
-- 2. `room_availability` (0012) ferme une salle TOUTES LES SEMAINES au même
--    créneau. Elle ne sait pas dire « le laboratoire est en travaux du 5 au
--    20 novembre ». D'où `room_closures`, qui raisonne en dates, comme les
--    congés scolaires.

-- -----------------------------------------------------------------------------
-- 1. Préférer un type de salle
-- -----------------------------------------------------------------------------

alter table teaching_requirements
  add column if not exists preferred_room_type_id uuid references room_types(id) on delete set null;

comment on column teaching_requirements.preferred_room_type_id is
  'Type de salle souhaité (non obligatoire) : utilisé s''il est libre, sinon une salle ordinaire.';

alter table teaching_requirements
  drop constraint if exists teaching_requirements_room_mode_coherent;
alter table teaching_requirements
  add constraint teaching_requirements_room_mode_coherent check (
    (room_requirement_mode = 'REQUIRED_ROOM' and required_room_id is not null)
    or (room_requirement_mode = 'REQUIRED_TYPE' and required_room_type_id is not null)
    or (room_requirement_mode = 'PREFERRED' and (preferred_room_id is not null or preferred_room_type_id is not null))
    or room_requirement_mode = 'NONE'
  );

create index if not exists teaching_requirements_preferred_type_idx
  on teaching_requirements (preferred_room_type_id) where preferred_room_type_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Fermeture d'une salle sur une période
-- -----------------------------------------------------------------------------

create table if not exists room_closures (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  room_id          uuid not null references rooms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,

  starts_on        date not null,
  ends_on          date not null,
  reason           text not null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references users(id) on delete set null,

  constraint room_closures_range check (ends_on >= starts_on),
  constraint room_closures_reason_not_blank check (length(btrim(reason)) > 0)
);

create index if not exists room_closures_room_idx on room_closures (room_id, starts_on, ends_on);
create index if not exists room_closures_school_idx on room_closures (school_id, academic_year_id);

drop trigger if exists room_closures_touch on room_closures;
create trigger room_closures_touch before update on room_closures
  for each row execute function app.touch_updated_at();

comment on table room_closures is
  'Salle fermée sur une période (travaux, examens, prêt) : aucun cours ne doit s''y tenir ces jours-là.';

-- -----------------------------------------------------------------------------
-- Droits : lecture pour tout membre (l'information sert à tous les écrans),
-- écriture réservée à qui gère les salles.
-- -----------------------------------------------------------------------------

alter table room_closures enable row level security;
alter table room_closures force  row level security;

drop policy if exists room_closures_select on room_closures;
create policy room_closures_select on room_closures for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

drop policy if exists room_closures_insert on room_closures;
create policy room_closures_insert on room_closures for insert to authenticated
with check (app.can_write(school_id, 'rooms.update'));

drop policy if exists room_closures_update on room_closures;
create policy room_closures_update on room_closures for update to authenticated
using (app.can_write(school_id, 'rooms.update'))
with check (app.can_write(school_id, 'rooms.update'));

drop policy if exists room_closures_delete on room_closures;
create policy room_closures_delete on room_closures for delete to authenticated
using (app.can_write(school_id, 'rooms.update'));
