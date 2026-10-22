-- =============================================================================
-- 0133 — Un droit coché = un droit qui marche, à l'écran ET en base
-- =============================================================================
-- Analyse des rôles du 2026-10-22 : quatre droits disaient une chose à l'écran
-- et une autre en base.
--
-- 1. « Régler les dates de fin de trimestre » (grades.term_dates) : l'écran le
--    demandait, la base exigeait « Gérer les années scolaires ». Le Censeur
--    (qui a le premier, pas le second) recevait « Période introuvable » et
--    rien n'était enregistré. -> fonction set_term_dates, qui vérifie le bon
--    droit et ne touche QUE les trois dates.
-- 2. Modèle de bulletin : bouton = reports.manage_template, page =
--    settings.update, base = reports.manage_templates (droit caché). Un seul
--    droit désormais : reports.manage_template (celui de « Rôles et droits »).
-- 3. « Rouvrir un bulletin déjà validé » (reports.unlock) : l'écran le
--    demandait, la base ne vérifiait que reports.generate. La base l'exige
--    maintenant pour repasser un bulletin validé ou publié à « généré ».
-- 4. « Valider une version » (schedule.validate) : la base ne vérifiait que
--    schedule.update. Elle l'exige maintenant pour valider ; remettre une
--    version validée en brouillon (modifier un cours) reste possible avec
--    « Modifier l'emploi du temps ».
-- =============================================================================

-- 1. Dates de fin de trimestre ------------------------------------------------
create or replace function public.set_term_dates(
  p_period uuid,
  p_stop date,
  p_student_end date,
  p_head_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid;
  v_year uuid;
  v_filled int := (p_stop is not null)::int + (p_student_end is not null)::int + (p_head_end is not null)::int;
begin
  select ap.school_id, ap.academic_year_id into v_school, v_year
  from public.academic_periods ap where ap.id = p_period;
  if v_school is null then
    raise exception 'Période introuvable.' using errcode = 'P0002';
  end if;
  if not app.can_write_year(v_school, v_year, 'grades.term_dates') then
    raise exception 'Droit requis : régler les dates de fin de trimestre.' using errcode = '42501';
  end if;
  if v_filled not in (0, 3) then
    raise exception 'Renseignez les trois dates de fin de trimestre, ou aucune.' using errcode = '22023';
  end if;
  if p_student_end < p_stop then
    raise exception 'La vérification avec les élèves ne peut pas finir avant l’arrêt des notes.' using errcode = '22023';
  end if;
  if p_head_end < p_student_end then
    raise exception 'La vérification du professeur principal suit celle avec les élèves.' using errcode = '22023';
  end if;
  update public.academic_periods
  set grades_stop_on = p_stop, student_check_ends_on = p_student_end, head_check_ends_on = p_head_end
  where id = p_period;
end;
$$;
revoke all on function public.set_term_dates(uuid, date, date, date) from public, anon;
grant execute on function public.set_term_dates(uuid, date, date, date) to authenticated;

-- 2. Modèle de bulletin : un seul droit ----------------------------------------
-- Qui avait l'ancien droit caché garde la main (il avait déjà le droit visible
-- dans le modèle commun ; on le garantit aussi dans les copies d'école).
do $$
begin
  perform set_config('app.roles_provisioning', 'on', true);
  insert into public.role_permissions (role_id, permission_id, default_scope)
  select rp.role_id, (select id from public.permissions where code = 'reports.manage_template'), rp.default_scope
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id and p.code = 'reports.manage_templates'
  on conflict do nothing;
  perform set_config('app.roles_provisioning', 'off', true);
end;
$$;

do $$
declare
  r record;
  v_q text;
  v_w text;
  v_sql text;
begin
  for r in
    select policyname, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = 'report_card_templates'
      and coalesce(qual, '') || coalesce(with_check, '') like '%reports.manage_templates%'
  loop
    v_q := replace(r.qual, '''reports.manage_templates''', '''reports.manage_template''');
    v_w := replace(r.with_check, '''reports.manage_templates''', '''reports.manage_template''');
    v_sql := format('alter policy %I on public.report_card_templates', r.policyname);
    if v_q is not null then v_sql := v_sql || format(' using (%s)', v_q); end if;
    if v_w is not null then v_sql := v_sql || format(' with check (%s)', v_w); end if;
    execute v_sql;
  end loop;
end;
$$;

-- 3. Rouvrir un bulletin validé : reports.unlock ---------------------------------
create or replace function app.guard_report_card_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_perm text;
  v_ignored text[] := array['status', 'signed_at', 'signed_by', 'published_at', 'updated_at'];
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    v_perm := case
      when new.status = 'PUBLISHED' then 'reports.publish'
      when new.status = 'VALIDATED' and old.status = 'PUBLISHED' then 'reports.publish'
      -- Rouvrir un bulletin validé ou publié : un droit à part (0133).
      when new.status = 'GENERATED' and old.status in ('VALIDATED', 'PUBLISHED') then 'reports.unlock'
      when new.status = 'GENERATED' then 'reports.generate'
      else 'reports.validate'
    end;
    if not app.has_permission(new.school_id, v_perm) then
      raise exception 'Droit requis pour cette etape du bulletin : %.', v_perm using errcode = '42501';
    end if;
    if new.status = 'PUBLISHED' and new.signed_at is null then
      raise exception 'Le bulletin doit etre signe avant sa publication.' using errcode = '23514';
    end if;
  end if;

  if new.signed_at is not null and (new.signed_at is distinct from old.signed_at or new.signed_by is distinct from old.signed_by) then
    if not app.has_permission(new.school_id, 'reports.sign') then
      raise exception 'Droit requis pour signer un bulletin : reports.sign.' using errcode = '42501';
    end if;
    if new.signed_by is distinct from auth.uid() then
      raise exception 'La signature doit porter l''identite de la personne qui signe.' using errcode = '42501';
    end if;
  end if;

  -- La trace de réouverture (qui, quand, pourquoi, révision) relève du droit de rouvrir.
  if (new.unlocked_at, new.unlocked_by, new.unlock_reason, new.revision)
       is distinct from (old.unlocked_at, old.unlocked_by, old.unlock_reason, old.revision)
     and not app.has_permission(new.school_id, 'reports.unlock') then
    raise exception 'Droit requis pour rouvrir un bulletin : reports.unlock.' using errcode = '42501';
  end if;

  -- Toute autre colonne (moyennes, rang, appreciations) releve de la generation.
  if (to_jsonb(new) - v_ignored - array['unlocked_at', 'unlocked_by', 'unlock_reason', 'revision'])
       is distinct from (to_jsonb(old) - v_ignored - array['unlocked_at', 'unlocked_by', 'unlock_reason', 'revision'])
     and not app.has_permission(new.school_id, 'reports.generate') then
    raise exception 'Droit requis pour modifier le contenu d''un bulletin : reports.generate.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 4. Valider une version d'emploi du temps : schedule.validate -------------------
create or replace function app.guard_schedule_version_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_ignored text[] := array['status', 'published_at', 'published_by', 'updated_at', 'validated_at', 'validated_by', 'validation_note'];
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Publier, et archiver la version publiée qu'elle remplace : droit de publication.
    if new.status = 'PUBLISHED' or old.status = 'PUBLISHED' then
      if not app.has_permission(new.school_id, 'schedule.publish') then
        raise exception 'Droit requis pour publier un emploi du temps : schedule.publish.' using errcode = '42501';
      end if;
    -- Valider : droit de validation (0133).
    elsif new.status = 'VALIDATED' then
      if not app.has_permission(new.school_id, 'schedule.validate') then
        raise exception 'Droit requis pour valider un emploi du temps : schedule.validate.' using errcode = '42501';
      end if;
    -- Rouvrir une version validée (ou modifier un cours, qui la remet en brouillon).
    elsif old.status = 'VALIDATED' then
      if not (app.has_permission(new.school_id, 'schedule.validate') or app.has_permission(new.school_id, 'schedule.update')) then
        raise exception 'Droit requis pour rouvrir un emploi du temps : schedule.validate.' using errcode = '42501';
      end if;
    elsif not app.has_permission(new.school_id, 'schedule.update') then
      raise exception 'Droit requis pour modifier un emploi du temps : schedule.update.' using errcode = '42501';
    end if;
  end if;

  -- La trace de validation ne se pose qu'avec le droit de valider.
  if new.validated_at is not null and new.validated_at is distinct from old.validated_at
     and not app.has_permission(new.school_id, 'schedule.validate') then
    raise exception 'Droit requis pour valider un emploi du temps : schedule.validate.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored)
     and not app.has_permission(new.school_id, 'schedule.update') then
    raise exception 'Droit requis pour modifier un emploi du temps : schedule.update.' using errcode = '42501';
  end if;
  return new;
end;
$$;
