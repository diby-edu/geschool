-- =============================================================================
-- 0105 — Présences : ce que l'audit du 2026-10-14 a trouvé
-- =============================================================================
--
--   1. Corriger après « Valider l'appel ». L'écran le promettait tant que le
--      cours dure, mais la RLS de attendance_records n'acceptait une
--      modification de l'enseignant que sur un registre OPEN : après la
--      validation (SUBMITTED), la correction de l'élève arrivé en retard
--      échouait. Désormais OPEN ou SUBMITTED ; seul VALIDATED (vie scolaire)
--      ferme l'appel.
--
--   2. Un appel fait SANS RÉSEAU n'est jamais perdu, quelle que soit la durée
--      de la coupure. Le droit de l'enseignant se jugeait à l'instant où le
--      serveur RECEVAIT l'appel (now()) : un appel fait à 8h10 et reçu à 9h05,
--      cours fini à 9h00, était refusé. Il se juge maintenant à l'instant où
--      l'appel a été FAIT (taken_at, noté par l'appareil). Cet instant doit
--      tomber dans le créneau, et ne peut pas être dans le futur. Le geste
--      reste tracé comme OFFLINE_SYNC : la vie scolaire voit qu'il est arrivé
--      après coup.
--
--   3. L'enseignant ne peut plus passer lui-même un appel à VALIDATED : ce
--      statut appartient au droit `attendance.validate`.
--
--   4. Heures d'absence non justifiées, par élève et par période : la durée
--      RÉELLE de chaque cours manqué (horaire de remplacement compris). Une
--      absence est justifiée si elle est EXCUSED ou couverte par un
--      justificatif APPROUVÉ. Le bulletin compte en heures, plus en cours.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Instant de l'appel, tel que l'a vécu l'enseignant
-- -----------------------------------------------------------------------------
alter table attendance_records add column if not exists taken_at timestamptz;
update attendance_records set taken_at = recorded_at where taken_at is null;
alter table attendance_records alter column taken_at set default now();
alter table attendance_records alter column taken_at set not null;

comment on column attendance_records.taken_at is
  'Instant ou l''appel a ete fait. En ligne : l''heure du serveur. Hors ligne : l''heure de l''appareil, qui doit tomber dans le creneau.';

-- -----------------------------------------------------------------------------
-- 2. Le droit de l'enseignant, jugé à un instant donné
-- -----------------------------------------------------------------------------
create or replace function app.can_take_attendance_at(p_school uuid, p_occurrence uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select p_at is not null
     -- Un instant futur trahit une horloge fausse ou une saisie forcée.
     -- Cinq minutes de tolérance pour l'écart d'horloge du téléphone.
     and p_at <= now() + interval '5 minutes'
     and app.is_member_of(p_school)
     and app.school_is_writable(p_school)
     and exists (
       select 1
       from public.session_occurrences o
       where o.id = p_occurrence
         and o.school_id = p_school
         and o.status <> 'CANCELLED'
         and p_at >= coalesce(o.override_starts_at, o.starts_at)
         and p_at <  coalesce(o.override_ends_at, o.ends_at)
         and (
           exists (
             select 1
             from public.schedule_session_teachers st
             join public.teachers t on t.id = st.teacher_id
             where st.session_id = o.schedule_session_id
               and t.user_id = auth.uid()
               and t.deleted_at is null
           )
           or exists (
             select 1 from public.teachers t
             where t.id = o.override_teacher_id and t.user_id = auth.uid()
           )
         )
     );
$$;

comment on function app.can_take_attendance_at(uuid, uuid, timestamptz) is
  'L''enseignant de la seance, si l''instant donne tombe dans le creneau (appel fait hors ligne, recu plus tard).';

create or replace function public.can_take_attendance_at(p_school uuid, p_occurrence uuid, p_at timestamptz)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.can_take_attendance_at(p_school, p_occurrence, p_at);
$$;

grant execute on function app.can_take_attendance_at(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.can_take_attendance_at(uuid, uuid, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Registres
-- -----------------------------------------------------------------------------
drop policy if exists registers_insert on attendance_registers;
create policy registers_insert on attendance_registers for insert to authenticated
with check (
  app.can_take_attendance(school_id, session_occurrence_id)
  or (source = 'OFFLINE_SYNC' and app.can_take_attendance_at(school_id, session_occurrence_id, taken_at))
);

-- VALIDATED n'est posé que par le droit `attendance.validate`.
drop policy if exists registers_update on attendance_registers;
create policy registers_update on attendance_registers for update to authenticated
using (
  app.can_take_attendance(school_id, session_occurrence_id)
  or app.can_write(school_id, 'attendance.validate')
)
with check (
  app.can_write(school_id, 'attendance.validate')
  or (app.can_take_attendance(school_id, session_occurrence_id) and status <> 'VALIDATED')
);

-- Verrouiller un appel (OPEN -> SUBMITTED), y compris au rejeu d'un appel fait
-- hors ligne : p_at est l'instant où l'enseignant a appuyé sur « Valider ».
create or replace function public.submit_attendance_register(p_register uuid, p_at timestamptz default null)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  select id, school_id, session_occurrence_id, status
    into r
    from attendance_registers
   where id = p_register;
  if not found then
    raise exception 'Appel introuvable.' using errcode = 'P0002';
  end if;

  if not (
    app.can_take_attendance(r.school_id, r.session_occurrence_id)
    or (p_at is not null and app.can_take_attendance_at(r.school_id, r.session_occurrence_id, p_at))
  ) then
    raise exception 'Vous n''etes pas habilite a valider cet appel.' using errcode = '42501';
  end if;

  if r.status = 'VALIDATED' then
    return 'VALIDATED';
  end if;

  update attendance_registers set status = 'SUBMITTED' where id = r.id and status = 'OPEN';
  return 'SUBMITTED';
end;
$$;

revoke all on function public.submit_attendance_register(uuid, timestamptz) from public, anon;
grant execute on function public.submit_attendance_register(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lignes d'appel : modifiables par l'enseignant tant que le registre n'est
--    pas VALIDATED (OPEN ou SUBMITTED), pendant le créneau — ou à l'instant
--    où l'appel a été fait, s'il arrive hors ligne.
-- -----------------------------------------------------------------------------
drop policy if exists attendance_records_insert on attendance_records;
create policy attendance_records_insert on attendance_records for insert to authenticated
with check (
  app.can_write(school_id, 'attendance.update')
  or exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and r.status in ('OPEN', 'SUBMITTED')
      and (
        app.can_take_attendance(r.school_id, r.session_occurrence_id)
        or app.can_take_attendance_at(r.school_id, r.session_occurrence_id, attendance_records.taken_at)
      )
  )
);

drop policy if exists attendance_records_update on attendance_records;
create policy attendance_records_update on attendance_records for update to authenticated
using (
  app.can_write(school_id, 'attendance.update')
  or exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and r.status in ('OPEN', 'SUBMITTED')
      and (
        app.can_take_attendance(r.school_id, r.session_occurrence_id)
        or app.can_take_attendance_at(r.school_id, r.session_occurrence_id, attendance_records.taken_at)
      )
  )
)
with check (
  app.can_write(school_id, 'attendance.update')
  or exists (
    select 1 from attendance_registers r
    where r.id = attendance_records.register_id
      and r.status in ('OPEN', 'SUBMITTED')
      and (
        app.can_take_attendance(r.school_id, r.session_occurrence_id)
        or app.can_take_attendance_at(r.school_id, r.session_occurrence_id, attendance_records.taken_at)
      )
  )
);

-- -----------------------------------------------------------------------------
-- 5. Heures d'absence par élève sur une période
-- -----------------------------------------------------------------------------
create or replace function public.attendance_hours(p_school uuid, p_students uuid[], p_from date, p_to date)
returns table (student_id uuid, unjustified_hours numeric, justified_hours numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with missed as (
    select r.student_id,
           r.status,
           o.occurs_on,
           extract(epoch from (coalesce(o.override_ends_at, o.ends_at)
                             - coalesce(o.override_starts_at, o.starts_at))) / 3600.0 as hours
    from attendance_records r
    join attendance_registers g on g.id = r.register_id
    join session_occurrences o on o.id = g.session_occurrence_id
    where r.school_id = p_school
      and r.student_id = any(p_students)
      and r.status in ('ABSENT', 'EXCUSED')
      and o.status <> 'CANCELLED'
      and o.occurs_on between p_from and p_to
  ),
  tagged as (
    select m.student_id,
           m.hours,
           (m.status = 'EXCUSED' or exists (
              select 1 from absence_justifications j
              where j.school_id = p_school
                and j.student_id = m.student_id
                and j.status = 'APPROVED'
                and m.occurs_on between j.covers_from and j.covers_to
           )) as justified
    from missed m
  )
  select t.student_id,
         round(coalesce(sum(t.hours) filter (where not t.justified), 0)::numeric, 2),
         round(coalesce(sum(t.hours) filter (where t.justified), 0)::numeric, 2)
  from tagged t
  group by t.student_id;
$$;

grant execute on function public.attendance_hours(uuid, uuid[], date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Bulletin : heures d'absence non justifiées. NULL = bulletin généré avant
--    cette migration (il garde son ancien affichage, en nombre d'absences).
-- -----------------------------------------------------------------------------
alter table report_cards add column if not exists absence_hours_unjustified numeric(7,2);

comment on column report_cards.absence_hours_unjustified is
  'Heures d''absence non justifiees sur la periode (duree reelle des cours manques). NULL : bulletin anterieur au calcul en heures.';
