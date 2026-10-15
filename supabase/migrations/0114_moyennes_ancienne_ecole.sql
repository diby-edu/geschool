-- =============================================================================
-- 0114 — Élève arrivé en cours d'année : moyennes de son ancienne école
-- =============================================================================
--
-- Un élève arrivé au 2e trimestre n'a pas de bulletin du 1er chez nous. Pour
-- sa moyenne annuelle, chaque établissement choisit (réglage des bulletins,
-- `reporting.newcomerAnnual`) :
--   A. ATTENDED        : la moyenne annuelle se calcule sur les périodes faites
--                        dans l'établissement (défaut) ;
--   B. PREVIOUS_SCHOOL : l'école saisit les moyennes de son ancienne école pour
--                        les périodes manquantes (table ci-dessous).
--
-- Saisie par le droit `reports.generate` (direction, censeur), journalisée.
-- =============================================================================

create table if not exists previous_school_averages (
  school_id          uuid not null references schools(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  average            numeric(8,3) not null,
  previous_school    text,
  entered_by         uuid references users(id) on delete set null,
  entered_at         timestamptz not null default now(),
  primary key (academic_period_id, student_id),
  constraint previous_school_averages_range check (average >= 0)
);

alter table previous_school_averages enable row level security;
alter table previous_school_averages force  row level security;
drop policy if exists previous_school_averages_select on previous_school_averages;
create policy previous_school_averages_select on previous_school_averages for select to authenticated
using (app.can_see_student(school_id, student_id));
grant select on previous_school_averages to authenticated;

-- p_average null = retirer.
create or replace function public.set_previous_school_average(
  p_student uuid, p_period uuid, p_average numeric, p_previous_school text
)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_per   academic_periods%rowtype;
  v_prev  previous_school_averages%rowtype;
  v_max   numeric;
  v_class uuid;
  v_name  text;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then raise exception 'Période introuvable.' using errcode = 'P0002'; end if;
  if not (app.is_platform_admin() or app.can_write(v_per.school_id, 'reports.generate')) then
    raise exception 'Droit requis : générer les bulletins.' using errcode = '42501';
  end if;
  v_class := app.student_class_for_period(p_student, p_period);
  if v_class is null then
    raise exception 'Cet élève n''est pas inscrit cette année.' using errcode = '22023';
  end if;
  -- Une moyenne imprimée chez nous fait foi : on ne la remplace pas.
  if exists (select 1 from report_cards rc
             where rc.student_id = p_student and rc.academic_period_id = p_period and rc.general_average is not null) then
    raise exception 'Cet élève a déjà une moyenne sur un bulletin de l''établissement pour « % ».', v_per.name using errcode = '23514';
  end if;

  select * into v_prev from previous_school_averages where academic_period_id = p_period and student_id = p_student;
  select last_name || ' ' || first_name into v_name from students where id = p_student;

  if p_average is null then
    delete from previous_school_averages where academic_period_id = p_period and student_id = p_student;
  else
    select coalesce(max(gs.max_score), 20) into v_max from grading_scales gs where gs.school_id = v_per.school_id and gs.is_default;
    if p_average < 0 or p_average > coalesce(v_max, 20) then
      raise exception 'La moyenne doit être entre 0 et %.', trim(to_char(coalesce(v_max, 20), 'FM999990.##')) using errcode = '22023';
    end if;
    insert into previous_school_averages (school_id, academic_period_id, student_id, average, previous_school, entered_by)
    values (v_per.school_id, p_period, p_student, p_average, nullif(btrim(coalesce(p_previous_school, '')), ''), auth.uid())
    on conflict (academic_period_id, student_id)
    do update set average = excluded.average, previous_school = excluded.previous_school,
                  entered_by = excluded.entered_by, entered_at = now();
  end if;

  perform app.log_term_event(v_per.school_id,
    case when p_average is null then 'grades.previous_school_remove' else 'grades.previous_school' end,
    'student', p_student,
    case when v_prev.student_id is null then null else jsonb_build_object('average', v_prev.average) end,
    jsonb_build_object('average', p_average, 'previous_school', p_previous_school, 'student_id', p_student,
                       'student', v_name, 'class_id', v_class, 'period_id', p_period));
end;
$$;

revoke all on function public.set_previous_school_average(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.set_previous_school_average(uuid, uuid, numeric, text) to authenticated;
