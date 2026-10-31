-- =============================================================================
-- 0167 — Tableau de bord : tous les comptages en une lecture
-- =============================================================================
-- Relevé du serveur le 2026-10-31 : le tableau de bord lance 26 lectures à la
-- fois. La base répond à chacune en quelques centièmes de seconde, mais le
-- serveur (un seul processeur) les traite l'une après l'autre : chacune met
-- 0,15 à 0,5 s à revenir. Seize d'entre elles ne font que compter (élèves,
-- enseignants, parents, justificatifs, emploi du temps publié, liste
-- « démarrage »). Cette fonction les rend toutes en une fois.
--
-- Chaque bloc n'est rendu qu'avec le droit qui l'ouvrait déjà (null sinon) :
--   élèves               students.view
--   enseignants          teachers.view
--   parents              access_accounts.view
--   justificatifs        attendance.justify ou attendance.view_all
--   emploi du temps      schedule.view
--   liste « démarrage »  membre de l'école (ce ne sont que des « il y en a / il
--                        n'y en a pas » pour savoir quelle étape reste à faire)
-- Mêmes définitions que les lectures qu'elle remplace (staff.ts, checklist.ts).
-- =============================================================================

create or replace function public.dashboard_counts(p_school uuid, p_year uuid, p_since date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member boolean := app.is_platform_admin() or app.is_member_of(p_school);
  v_out jsonb := '{}'::jsonb;
begin
  if not v_member then
    raise exception 'Acces refuse.' using errcode = '42501';
  end if;

  if app.can_read(p_school, 'students.view') then
    v_out := v_out || jsonb_build_object(
      'students_total',
        case when p_year is null
          then (select count(*) from students s where s.school_id = p_school and s.deleted_at is null)
          else (select count(*) from student_enrollments e
                where e.school_id = p_school and e.academic_year_id = p_year and e.status = 'ENROLLED')
        end,
      'students_new',
        case when p_year is null then 0
          else (select count(*) from student_enrollments e
                where e.school_id = p_school and e.academic_year_id = p_year and e.status = 'ENROLLED'
                  and e.enrolled_on >= p_since)
        end);
  end if;

  if app.can_read(p_school, 'teachers.view') then
    v_out := v_out || jsonb_build_object('teachers', (
      select jsonb_build_object(
        'total', count(*),
        'with_access', count(*) filter (where t.user_id is not null),
        'by_contract', coalesce((
          select jsonb_object_agg(x.employment_type, x.n)
          from (select t2.employment_type, count(*) as n from teachers t2
                where t2.school_id = p_school and t2.deleted_at is null and t2.employment_type is not null
                group by t2.employment_type) x), '{}'::jsonb))
      from teachers t
      where t.school_id = p_school and t.deleted_at is null));
  end if;

  if app.can_read(p_school, 'access_accounts.view') then
    v_out := v_out || jsonb_build_object('parents', jsonb_build_object(
      'families', (select count(*) from guardians g where g.school_id = p_school and g.status = 'ACTIVE'),
      'total', (select count(*) from account_access a where a.school_id = p_school and a.subject_kind = 'GUARDIAN'),
      'activated', (select count(*) from account_access a where a.school_id = p_school and a.subject_kind = 'GUARDIAN'
                      and a.activation_status = 'ACTIVATED'),
      'pending', (select count(*) from account_access a where a.school_id = p_school and a.subject_kind = 'GUARDIAN'
                    and a.activation_status <> 'ACTIVATED' and a.account_status <> 'SUSPENDED')));
  end if;

  if app.can_read(p_school, 'attendance.justify') or app.can_read(p_school, 'attendance.view_all') then
    v_out := v_out || jsonb_build_object('pending_justifications',
      (select count(*) from absence_justifications j where j.school_id = p_school and j.status = 'PENDING'));
  end if;

  if p_year is not null and app.can_read(p_school, 'schedule.view') then
    v_out := v_out || jsonb_build_object('schedule_published',
      (select count(*) from schedule_versions v
       where v.school_id = p_school and v.academic_year_id = p_year and v.status = 'PUBLISHED'));
  end if;

  v_out := v_out || jsonb_build_object('setup', jsonb_build_object(
    'levels', exists (select 1 from levels l where l.school_id = p_school),
    'classes', exists (select 1 from classes c where c.school_id = p_school
                         and (p_year is null or c.academic_year_id = p_year)),
    'subjects', exists (select 1 from subjects s where s.school_id = p_school),
    'teachers', exists (select 1 from teachers t where t.school_id = p_school and t.deleted_at is null),
    'students', exists (select 1 from students s where s.school_id = p_school and s.deleted_at is null),
    'periods', p_year is not null and exists (select 1 from academic_periods p
                                               where p.school_id = p_school and p.academic_year_id = p_year),
    'scales', exists (select 1 from grading_scales g where g.school_id = p_school),
    'staff', exists (select 1 from staff_profiles s where s.school_id = p_school),
    'hours', p_year is not null and exists (select 1 from schedule_configurations s
                                             where s.school_id = p_school and s.academic_year_id = p_year)));

  return v_out;
end;
$$;

revoke all on function public.dashboard_counts(uuid, uuid, date) from public, anon;
grant execute on function public.dashboard_counts(uuid, uuid, date) to authenticated;
