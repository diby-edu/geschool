-- =============================================================================
-- 0113 — Conseil de classe : la moyenne retenue par le conseil
-- =============================================================================
--
-- Décidé le 2026-10-15. Au conseil de classe, il arrive qu'un élève soit
-- repêché ou bénéficie d'une dérogation. On ne touche JAMAIS aux notes ni à la
-- moyenne calculée : le conseil saisit une « moyenne retenue », qui la
-- REMPLACE sur le bulletin, sans aucune mention ni couleur (on ne doit pas
-- savoir qu'il y a eu repêchage). Le RANG est recalculé avec elle.
-- La moyenne calculée reste dans l'application, et tout est journalisé.
--
-- Droit : `reports.council_average` (direction par défaut).
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('reports.council_average', 'reports', 'council_average', 'Saisir la moyenne retenue par le conseil de classe', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR'])
  where p.code = 'reports.council_average'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

create table if not exists council_averages (
  school_id          uuid not null references schools(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  class_id           uuid not null references classes(id) on delete cascade,
  average            numeric(8,3) not null,
  -- Moyenne calculée au moment de la décision (trace, jamais imprimée).
  computed_average   numeric(8,3),
  reason             text not null,
  set_by             uuid references users(id) on delete set null,
  set_at             timestamptz not null default now(),
  primary key (academic_period_id, student_id),
  constraint council_averages_range check (average >= 0)
);
create index if not exists council_averages_class_idx on council_averages (class_id, academic_period_id);

alter table council_averages enable row level security;
alter table council_averages force  row level security;
drop policy if exists council_averages_select on council_averages;
create policy council_averages_select on council_averages for select to authenticated
using (app.can_view_class_grades(class_id));
grant select on council_averages to authenticated;
-- Écritures : uniquement par public.set_council_average.

-- p_average null = retirer la moyenne retenue (on revient à la moyenne calculée).
create or replace function public.set_council_average(
  p_class uuid, p_period uuid, p_student uuid, p_average numeric, p_computed numeric, p_reason text
)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_per  academic_periods%rowtype;
  v_prev council_averages%rowtype;
  v_max  numeric;
  v_name text;
begin
  select * into v_per from academic_periods where id = p_period;
  if not found then raise exception 'Période introuvable.' using errcode = 'P0002'; end if;
  if not (app.is_platform_admin() or app.can_write(v_per.school_id, 'reports.council_average')) then
    raise exception 'Droit requis : saisir la moyenne retenue par le conseil.' using errcode = '42501';
  end if;
  if app.student_class_for_period(p_student, p_period) is distinct from p_class then
    raise exception 'Cet élève n''est pas dans la classe.' using errcode = '22023';
  end if;
  -- Un bulletin déjà validé ou publié ne change plus en silence.
  if exists (select 1 from report_cards rc
             where rc.student_id = p_student and rc.academic_period_id = p_period
               and rc.status in ('VALIDATED', 'PUBLISHED')) then
    raise exception 'Le bulletin de cet élève est déjà validé : rouvrez-le avant de changer sa moyenne.' using errcode = '42501';
  end if;

  select * into v_prev from council_averages where academic_period_id = p_period and student_id = p_student;
  select last_name || ' ' || first_name into v_name from students where id = p_student;

  if p_average is null then
    delete from council_averages where academic_period_id = p_period and student_id = p_student;
  else
    select coalesce(max(gs.max_score), 20) into v_max from grading_scales gs where gs.school_id = v_per.school_id and gs.is_default;
    if p_average < 0 or p_average > coalesce(v_max, 20) then
      raise exception 'La moyenne retenue doit être entre 0 et %.', coalesce(v_max, 20) using errcode = '22023';
    end if;
    if p_reason is null or length(btrim(p_reason)) < 2 then
      raise exception 'Indiquez le motif (repêchage, dérogation…).' using errcode = '22023';
    end if;
    insert into council_averages (school_id, academic_period_id, student_id, class_id, average, computed_average, reason, set_by)
    values (v_per.school_id, p_period, p_student, p_class, p_average, p_computed, btrim(p_reason), auth.uid())
    on conflict (academic_period_id, student_id)
    do update set average = excluded.average, computed_average = excluded.computed_average,
                  reason = excluded.reason, set_by = excluded.set_by, set_at = now(), class_id = excluded.class_id;
  end if;

  perform app.log_term_event(v_per.school_id,
    case when p_average is null then 'grades.council_average_remove' else 'grades.council_average' end,
    'student', p_student,
    case when v_prev.student_id is null then null
         else jsonb_build_object('average', v_prev.average, 'reason', v_prev.reason) end,
    jsonb_build_object('average', p_average, 'computed', p_computed, 'reason', btrim(coalesce(p_reason, '')))
      || jsonb_build_object('student_id', p_student, 'student', v_name, 'class_id', p_class, 'period_id', p_period));
end;
$$;

revoke all on function public.set_council_average(uuid, uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.set_council_average(uuid, uuid, uuid, numeric, numeric, text) to authenticated;
