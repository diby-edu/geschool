-- =============================================================================
-- 0160 — Tableaux de bord rapides : totaux par appel, version des notes
-- =============================================================================
-- Mesuré le 2026-10-28 (Cocotiers, 4 000 élèves) : la tendance des présences
-- sur 6 semaines prenait 2,5 s et les « classes à surveiller » 1,25 s, parce
-- qu'elles relisaient à chaque ouverture les 215 000 lignes de présence.
--
-- Ici, chaque appel garde ses totaux (élèves comptés, présents ou en retard,
-- absents, retards, excusés), tenus à jour par la base à chaque saisie, quelle
-- qu'en soit la source (page, mode hors ligne, fonction). Les deux tableaux
-- lisent ~12 000 appels au lieu de ~215 000 présences, avec les mêmes chiffres.
--
-- La table vit dans le schéma app : donnée dérivée, jamais lue ni écrite par
-- l'application, hors des sauvegardes d'école. Une restauration (qui coupe les
-- déclencheurs) la recalcule par app.recount_school_registers.
-- =============================================================================

create table app.attendance_register_counts (
  register_id uuid primary key references public.attendance_registers(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  records     int not null default 0,
  ok          int not null default 0,  -- présents + en retard
  absent      int not null default 0,  -- absences non excusées
  late        int not null default 0,
  excused     int not null default 0
);
create index attendance_register_counts_school_idx on app.attendance_register_counts (school_id);
revoke all on app.attendance_register_counts from public, anon, authenticated;

create or replace function app.recount_registers(p_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from app.attendance_register_counts c
  where c.register_id = any(p_ids)
    and not exists (select 1 from attendance_records ar where ar.register_id = c.register_id);

  insert into app.attendance_register_counts (register_id, school_id, records, ok, absent, late, excused)
  select ar.register_id, ar.school_id,
         count(*),
         count(*) filter (where ar.status in ('PRESENT', 'LATE')),
         count(*) filter (where ar.status = 'ABSENT'),
         count(*) filter (where ar.status = 'LATE'),
         count(*) filter (where ar.status = 'EXCUSED')
  from attendance_records ar
  where ar.register_id = any(p_ids)
    and exists (select 1 from attendance_registers r where r.id = ar.register_id)
  group by ar.register_id, ar.school_id
  on conflict (register_id) do update
    set records = excluded.records, ok = excluded.ok, absent = excluded.absent,
        late = excluded.late, excused = excluded.excused;
$$;
revoke all on function app.recount_registers(uuid[]) from public, anon, authenticated;

create or replace function app.recount_school_registers(p_school uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from app.attendance_register_counts where school_id = p_school;
  select app.recount_registers(array(select r.id from attendance_registers r where r.school_id = p_school));
$$;
revoke all on function app.recount_school_registers(uuid) from public, anon, authenticated;
grant execute on function app.recount_school_registers(uuid) to service_role;

-- Un déclencheur par instruction (et non par ligne) : un appel de 40 élèves
-- enregistré d'un coup ne recalcule son total qu'une fois.
create or replace function app.attendance_records_recount_ins()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.recount_registers(array(select distinct register_id from new_rows));
  return null;
end; $$;

create or replace function app.attendance_records_recount_upd()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.recount_registers(array(
    select register_id from new_rows union select register_id from old_rows));
  return null;
end; $$;

create or replace function app.attendance_records_recount_del()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.recount_registers(array(select distinct register_id from old_rows));
  return null;
end; $$;

create trigger attendance_records_recount_ins after insert on attendance_records
  referencing new table as new_rows for each statement execute function app.attendance_records_recount_ins();
create trigger attendance_records_recount_upd after update on attendance_records
  referencing old table as old_rows new table as new_rows for each statement execute function app.attendance_records_recount_upd();
create trigger attendance_records_recount_del after delete on attendance_records
  referencing old table as old_rows for each statement execute function app.attendance_records_recount_del();

-- Les appels existants.
insert into app.attendance_register_counts (register_id, school_id, records, ok, absent, late, excused)
select ar.register_id, r.school_id,
       count(*),
       count(*) filter (where ar.status in ('PRESENT', 'LATE')),
       count(*) filter (where ar.status = 'ABSENT'),
       count(*) filter (where ar.status = 'LATE'),
       count(*) filter (where ar.status = 'EXCUSED')
from attendance_records ar
join attendance_registers r on r.id = ar.register_id
group by ar.register_id, r.school_id;

-- -----------------------------------------------------------------------------
-- Les deux tableaux, mêmes signatures et mêmes chiffres qu'en 0055
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_weekly_attendance(p_school uuid, p_from date, p_to date, p_now timestamptz)
returns table (week_start date, records int, ok int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;
  return query
  select date_trunc('week', o.occurs_on)::date,
         sum(n.records)::int,
         sum(n.ok)::int
  from app.dashboard_occurrences(p_school, p_from, p_to) o
  join app.attendance_register_counts n on n.register_id = o.register_id
  where o.e_at <= p_now
  group by 1
  order by 1;
end;
$$;

create or replace function public.dashboard_low_attendance_classes(
  p_school uuid, p_from date, p_to date, p_now timestamptz, p_limit int default 6
)
returns table (class_id uuid, class_name text, rate numeric, unjustified int, records int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;
  return query
  select c.id, c.name,
         round(100.0 * sum(n.ok) / sum(n.records), 1),
         sum(n.absent)::int,
         sum(n.records)::int
  from app.dashboard_occurrences(p_school, p_from, p_to) o
  join app.attendance_register_counts n on n.register_id = o.register_id
  join classes c on c.id = o.class_id
  where o.e_at <= p_now and n.records > 0
  group by c.id, c.name
  order by 3 asc, c.name
  limit greatest(p_limit, 1);
end;
$$;

-- =============================================================================
-- Version des notes par école : les moyennes par classe gardées tant que rien ne change
-- =============================================================================
-- Les moyennes par classe relisent toutes les notes de la période (175 000 sur
-- un grand établissement : 2,5 à 5 s). Le serveur les garde en mémoire avec ce
-- numéro, que la base augmente à toute écriture qui peut les changer : note,
-- évaluation, type d'évaluation, coefficient, inscription, classe, période.
-- Le résultat gardé est donc toujours exact ; il n'est recalculé qu'après un
-- changement réel.
-- =============================================================================

create table app.school_grade_versions (
  school_id  uuid primary key references public.schools(id) on delete cascade,
  version    bigint not null default 1,
  changed_at timestamptz not null default now()
);
revoke all on app.school_grade_versions from public, anon, authenticated;

create or replace function app.bump_grade_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    insert into app.school_grade_versions as v (school_id)
    select distinct school_id from old_rows where school_id is not null
    on conflict (school_id) do update set version = v.version + 1, changed_at = now();
  else
    insert into app.school_grade_versions as v (school_id)
    select distinct school_id from new_rows where school_id is not null
    on conflict (school_id) do update set version = v.version + 1, changed_at = now();
  end if;
  return null;
end; $$;

do $$
declare
  t text;
begin
  foreach t in array array['grades', 'assessments', 'assessment_types', 'level_subjects', 'student_enrollments', 'classes', 'academic_periods'] loop
    execute format('create trigger %I after insert on public.%I referencing new table as new_rows for each statement execute function app.bump_grade_version()', t || '_grade_version_ins', t);
    execute format('create trigger %I after update on public.%I referencing new table as new_rows for each statement execute function app.bump_grade_version()', t || '_grade_version_upd', t);
    execute format('create trigger %I after delete on public.%I referencing old table as old_rows for each statement execute function app.bump_grade_version()', t || '_grade_version_del', t);
  end loop;
end $$;

-- Numéro de version des notes de l'école (0 = jamais modifié depuis 0160).
create or replace function public.school_grade_version(p_school uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select v.version from app.school_grade_versions v where v.school_id = p_school), 0)
  where app.can_read(p_school, 'grades.view_all');
$$;
revoke all on function public.school_grade_version(uuid) from public, anon;
grant execute on function public.school_grade_version(uuid) to authenticated;
