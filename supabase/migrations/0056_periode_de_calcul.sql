-- =============================================================================
-- 0056 — Periode de calcul des moyennes
-- =============================================================================
--
-- La direction fixe, pour chaque periode de notation, une FENETRE DE CALCUL des
-- moyennes (dates de debut et de fin) : elle se ferme automatiquement a la date de
-- fin. La direction peut aussi l'OUVRIR ou la FERMER a la main, a tout moment
-- (`grading_override`), puis revenir au mode automatique.
--
-- Pendant cette fenetre, chaque enseignant marque « terminees » ses moyennes,
-- classe par classe et matiere par matiere (`average_completions`). Le tableau de
-- bord de la direction affiche alors l'avancement (bloc « Moyennes et
-- bulletins »), visible seulement tant que la fenetre est ouverte.
--
-- Additif : trois colonnes, une table, des fonctions. Rejouable.

-- -----------------------------------------------------------------------------
-- 1. Fenetre de calcul sur la periode
-- -----------------------------------------------------------------------------
alter table academic_periods
  add column if not exists grading_starts_on date,
  add column if not exists grading_ends_on   date,
  add column if not exists grading_override  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'academic_periods_grading_override_valid') then
    alter table academic_periods
      add constraint academic_periods_grading_override_valid
      check (grading_override is null or grading_override in ('OPEN', 'CLOSED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'academic_periods_grading_dates') then
    alter table academic_periods
      add constraint academic_periods_grading_dates
      check (grading_starts_on is null or grading_ends_on is null or grading_ends_on >= grading_starts_on);
  end if;
end $$;

-- La fenetre est-elle ouverte a cette date ? Ouverture/fermeture manuelles d'abord,
-- sinon les dates configurees (fermeture automatique a la date de fin).
create or replace function app.grading_is_open(p_period uuid, p_today date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case ap.grading_override
           when 'OPEN' then true
           when 'CLOSED' then false
           else (ap.grading_starts_on is not null and ap.grading_ends_on is not null
                 and p_today between ap.grading_starts_on and ap.grading_ends_on)
         end
  from academic_periods ap
  where ap.id = p_period
$$;

-- -----------------------------------------------------------------------------
-- 2. « Moyennes terminees » : une ligne par affectation (enseignant + classe + matiere) et periode
-- -----------------------------------------------------------------------------
create or replace function app.owns_assignment(p_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from teaching_assignments ta
    join teachers t on t.id = ta.teacher_id
    where ta.id = p_assignment and t.user_id = auth.uid() and t.deleted_at is null
  )
$$;

create table if not exists average_completions (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references schools(id) on delete cascade,
  academic_period_id     uuid not null references academic_periods(id) on delete cascade,
  teaching_assignment_id uuid not null references teaching_assignments(id) on delete cascade,
  completed_by           uuid references users(id) on delete set null,
  completed_at           timestamptz not null default now(),
  constraint average_completions_once unique (academic_period_id, teaching_assignment_id)
);
create index if not exists average_completions_school_idx on average_completions (school_id, academic_period_id);

-- L'affectation et la periode doivent etre de l'etablissement et de la meme annee ;
-- un enseignant ne peut marquer qu'a l'ouverture de la fenetre de calcul.
create or replace function app.guard_average_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asg teaching_assignments%rowtype;
  v_per academic_periods%rowtype;
begin
  select * into v_asg from teaching_assignments where id = new.teaching_assignment_id;
  select * into v_per from academic_periods where id = new.academic_period_id;
  if v_asg.id is null or v_per.id is null
     or v_asg.school_id <> new.school_id or v_per.school_id <> new.school_id
     or v_asg.academic_year_id <> v_per.academic_year_id then
    raise exception 'Affectation ou periode invalide.' using errcode = '23503';
  end if;
  if not app.is_platform_admin() and not app.grading_is_open(new.academic_period_id, current_date) then
    raise exception 'La periode de calcul des moyennes est fermee.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists average_completions_guard on average_completions;
create trigger average_completions_guard before insert on average_completions
  for each row execute function app.guard_average_completion();

alter table average_completions enable row level security;
alter table average_completions force  row level security;

drop policy if exists average_completions_select on average_completions;
create policy average_completions_select on average_completions for select to authenticated
using (
  app.is_platform_admin()
  or app.owns_assignment(teaching_assignment_id)
  or app.can_read(school_id, 'grades.view_all')
);

drop policy if exists average_completions_insert on average_completions;
create policy average_completions_insert on average_completions for insert to authenticated
with check (app.owns_assignment(teaching_assignment_id) and completed_by = auth.uid());

-- Un enseignant peut rouvrir SES moyennes tant que la fenetre est ouverte ;
-- la direction peut toujours.
drop policy if exists average_completions_delete on average_completions;
create policy average_completions_delete on average_completions for delete to authenticated
using (
  (app.owns_assignment(teaching_assignment_id) and app.grading_is_open(academic_period_id, current_date))
  or app.can_write(school_id, 'academic_years.manage')
);

-- -----------------------------------------------------------------------------
-- 3. Bloc « Moyennes et bulletins » du tableau de bord (une ligne JSON)
-- Reserve a qui voit toutes les notes (`grades.view_all` : direction, censeur, inspecteur) :
-- un enseignant a `reports.view` mais ne doit pas lire l'avancement de ses collegues.
-- -----------------------------------------------------------------------------
-- Periode retenue : celle dont la fenetre est ouverte, sinon la derniere periode
-- de notation commencee (comme le reste du tableau de bord).
create or replace function public.dashboard_grading_overview(
  p_school uuid, p_year uuid, p_today date, p_pending_limit int default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_period academic_periods%rowtype;
  v jsonb;
begin
  if not app.can_read(p_school, 'grades.view_all') then
    raise exception 'Droit requis : consulter toutes les notes.' using errcode = '42501';
  end if;

  select * into v_period
  from academic_periods ap
  where ap.school_id = p_school and ap.academic_year_id = p_year and ap.is_grading_period
    and app.grading_is_open(ap.id, p_today)
  order by ap.sequence
  limit 1;
  if not found then
    select * into v_period
    from academic_periods ap
    where ap.school_id = p_school and ap.academic_year_id = p_year and ap.is_grading_period
      and ap.starts_on <= p_today
    order by ap.sequence desc
    limit 1;
  end if;
  if not found then
    return null;
  end if;

  with asg as (
    select ta.id, ta.teacher_id, ta.subject_id
    from teaching_assignments ta
    where ta.school_id = p_school and ta.academic_year_id = p_year
      and ta.status = 'ACTIVE' and ta.class_id is not null
      and (ta.academic_period_id is null or ta.academic_period_id = v_period.id)
  ),
  st as (
    select a.id, a.teacher_id, a.subject_id,
           exists (select 1 from average_completions ac
                    where ac.teaching_assignment_id = a.id and ac.academic_period_id = v_period.id) as ok
    from asg a
  ),
  per_teacher as (
    select s.teacher_id, count(*)::int as total, (count(*) filter (where not s.ok))::int as remaining
    from st s
    group by s.teacher_id
  ),
  pending as (
    select pt.teacher_id, pt.remaining,
           nullif(btrim(t.first_name || ' ' || t.last_name), '') as name,
           (select string_agg(distinct sj.name, ', ')
              from st s2 join subjects sj on sj.id = s2.subject_id
             where s2.teacher_id = pt.teacher_id and not s2.ok) as subjects
    from per_teacher pt
    join teachers t on t.id = pt.teacher_id and t.deleted_at is null
    where pt.remaining > 0
  ),
  cls as (
    select rc.class_id,
           min(case rc.status when 'DRAFT' then 0 when 'GENERATED' then 1 when 'VALIDATED' then 2 else 3 end) as lvl
    from report_cards rc
    where rc.school_id = p_school and rc.academic_period_id = v_period.id
    group by rc.class_id
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'id', v_period.id,
      'name', v_period.name,
      'starts_on', v_period.starts_on,
      'ends_on', v_period.ends_on,
      'grading_starts_on', v_period.grading_starts_on,
      'grading_ends_on', v_period.grading_ends_on,
      'override', v_period.grading_override,
      'open', app.grading_is_open(v_period.id, p_today)
    ),
    'teachers_total', (select count(*) from per_teacher)::int,
    'teachers_done', (select count(*) from per_teacher where remaining = 0)::int,
    'assignments_total', (select count(*) from st)::int,
    'assignments_done', (select count(*) from st where ok)::int,
    'pending_total', (select count(*) from pending)::int,
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
               'teacher_id', x.teacher_id, 'name', x.name, 'subjects', x.subjects, 'remaining', x.remaining)
             order by x.remaining desc, x.name)
      from (select * from pending order by remaining desc, name limit greatest(p_pending_limit, 1)) x
    ), '[]'::jsonb),
    'classes_total', (select count(*) from classes c
                       where c.school_id = p_school and c.academic_year_id = p_year and c.status = 'ACTIVE')::int,
    'bulletins_edited', (select count(*) from cls where lvl >= 1)::int,
    'bulletins_to_validate', (select count(*) from cls where lvl = 1)::int,
    'bulletins_validated', (select count(*) from cls where lvl = 2)::int,
    'bulletins_published', (select count(*) from cls where lvl = 3)::int
  )
  into v;

  return v;
end;
$$;

-- Liste complete des enseignants qui n'ont pas termine (bouton « Voir plus »)
create or replace function public.dashboard_grading_pending(
  p_school uuid, p_year uuid, p_period uuid, p_limit int default 200
)
returns table (teacher_id uuid, teacher_name text, subjects text, remaining int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'grades.view_all') then
    raise exception 'Droit requis : consulter toutes les notes.' using errcode = '42501';
  end if;
  return query
  select r.teacher_id, r.name, r.subjects, r.remaining
  from (
    select ta.teacher_id,
           nullif(btrim(t.first_name || ' ' || t.last_name), '') as name,
           string_agg(distinct sj.name, ', ') as subjects,
           (count(*))::int as remaining
    from teaching_assignments ta
    join teachers t on t.id = ta.teacher_id and t.deleted_at is null
    join subjects sj on sj.id = ta.subject_id
    where ta.school_id = p_school and ta.academic_year_id = p_year
      and ta.status = 'ACTIVE' and ta.class_id is not null
      and (ta.academic_period_id is null or ta.academic_period_id = p_period)
      and not exists (select 1 from average_completions ac
                       where ac.teaching_assignment_id = ta.id and ac.academic_period_id = p_period)
    group by ta.teacher_id, t.first_name, t.last_name
  ) r
  order by r.remaining desc, r.name
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.dashboard_grading_overview(uuid, uuid, date, int) from public, anon;
revoke all on function public.dashboard_grading_pending(uuid, uuid, uuid, int) from public, anon;
grant execute on function public.dashboard_grading_overview(uuid, uuid, date, int) to authenticated;
grant execute on function public.dashboard_grading_pending(uuid, uuid, uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Mise a jour en direct (comme les autres tables suivies, voir 0048 / 0049)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'average_completions') then
    alter publication supabase_realtime add table public.average_completions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'academic_periods') then
    alter publication supabase_realtime add table public.academic_periods;
  end if;
end $$;

drop trigger if exists live_notify_delete on average_completions;
create trigger live_notify_delete after delete on average_completions
  referencing old table as changed for each statement execute function app.live_notify_delete();
drop trigger if exists live_notify_delete on academic_periods;
create trigger live_notify_delete after delete on academic_periods
  referencing old table as changed for each statement execute function app.live_notify_delete();
