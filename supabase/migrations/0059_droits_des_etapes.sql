-- =============================================================================
-- 0059 — Chaque étape d'un circuit exige SON droit, dans la base
-- =============================================================================
--
-- PROBLEME  Quatre circuits confiaient leur étape clé à un droit plus large,
--           dans la base : la case « valider / publier / clôturer » cochée dans
--           « Rôles et droits » ne suffisait pas seule, et le droit large
--           permettait de la contourner par un appel direct à l'API.
--
--   Évaluations  : publier (grades.publish) et valider/clôturer (grades.validate)
--                  passaient par la règle de MODIFICATION (propriétaire ou
--                  assessments.update). Un censeur (grades.validate, pas
--                  assessments.update) ne pouvait pas clôturer ; un enseignant
--                  pouvait publier ses propres notes sans grades.publish.
--   Années       : clôturer (academic_years.close) et rouvrir
--                  (academic_years.reopen) exigeaient academic_years.manage, qui
--                  suffisait inversement à clôturer.
--   Emploi du temps : publier (schedule.publish) exigeait schedule.update pour
--                  changer le statut et schedule.delete pour remplacer les
--                  séances datées ; schedule.update suffisait à publier.
--   Appel        : valider (attendance.validate) n'était exigé que par
--                  l'application ; qui peut faire l'appel pouvait marquer son
--                  registre « validé » directement.
--   Annonces     : « rédiger » suffisait à créer une annonce déjà publiée.
--   Enseignants  : les coordonnées suivaient le nom, lisible sans « Voir les
--                  enseignants » (voir la dernière section).
--
-- CORRECTIF Même principe que les bulletins (0023, guard_report_card_update) :
--           la règle de mise à jour admet chacun des droits du circuit, et un
--           déclencheur vérifie, colonne par colonne, que CHAQUE changement est
--           couvert par le droit de SON étape. Le contenu reste au droit de
--           modification. Service_role et Super Admin passent (tâches de fond).

-- -----------------------------------------------------------------------------
-- Évaluations
-- -----------------------------------------------------------------------------

create or replace function app.guard_assessment_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_perm    text;
  v_ignored text[] := array['status', 'published_at', 'updated_at'];
  v_can_edit boolean;
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;
  v_can_edit := app.owns_assessment(new.id) or app.has_permission(new.school_id, 'assessments.update');

  if new.status is distinct from old.status then
    v_perm := case
      when new.status = 'PUBLISHED' then 'grades.publish'
      when new.status = 'CLOSED' or old.status in ('CLOSED', 'PUBLISHED') then 'grades.validate'
      else null -- brouillon <-> ouverte : relève de la modification
    end;
    if v_perm is not null and not app.has_permission(new.school_id, v_perm) then
      raise exception 'Droit requis pour cette étape de l''évaluation : %.', v_perm using errcode = '42501';
    end if;
    if v_perm is null and not v_can_edit then
      raise exception 'Droit requis pour modifier une évaluation : assessments.update.' using errcode = '42501';
    end if;
  end if;

  if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored) and not v_can_edit then
    raise exception 'Droit requis pour modifier une évaluation : assessments.update.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_guard on assessments;
create trigger assessments_guard
  before update on assessments
  for each row execute function app.guard_assessment_update();

drop policy assessments_update on assessments;
create policy assessments_update on assessments for update to authenticated
using (
  app.owns_assessment(id)
  or app.can_write(school_id, 'assessments.update')
  or app.can_write(school_id, 'grades.validate')
  or app.can_write(school_id, 'grades.publish')
)
with check (
  app.owns_assessment(id)
  or app.can_write(school_id, 'assessments.update')
  or app.can_write(school_id, 'grades.validate')
  or app.can_write(school_id, 'grades.publish')
);

-- -----------------------------------------------------------------------------
-- Années scolaires
-- -----------------------------------------------------------------------------

create or replace function app.guard_academic_year_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_perm    text;
  v_ignored text[] := array['status', 'updated_at'];
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    v_perm := case
      when new.status = 'CLOSED' then 'academic_years.close'
      when old.status in ('CLOSED', 'ARCHIVED') then 'academic_years.reopen'
      else 'academic_years.manage' -- activation, archivage
    end;
    if not app.has_permission(new.school_id, v_perm) then
      raise exception 'Droit requis pour cette étape de l''année scolaire : %.', v_perm using errcode = '42501';
    end if;
    -- Clôturer retire aussi le statut d'année courante : cela fait partie de l'étape.
    if new.status = 'CLOSED' and new.is_current is false then
      v_ignored := v_ignored || array['is_current'];
    end if;
  end if;

  if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored)
     and not app.has_permission(new.school_id, 'academic_years.manage') then
    raise exception 'Droit requis pour modifier une année scolaire : academic_years.manage.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists academic_years_guard on academic_years;
create trigger academic_years_guard
  before update on academic_years
  for each row execute function app.guard_academic_year_update();

drop policy academic_years_update on academic_years;
create policy academic_years_update on academic_years for update to authenticated
using (
  app.can_write(school_id, 'academic_years.manage')
  or app.can_write(school_id, 'academic_years.close')
  or app.can_write(school_id, 'academic_years.reopen')
)
with check (
  app.can_write(school_id, 'academic_years.manage')
  or app.can_write(school_id, 'academic_years.close')
  or app.can_write(school_id, 'academic_years.reopen')
);

-- -----------------------------------------------------------------------------
-- Emploi du temps : versions et séances datées
-- -----------------------------------------------------------------------------

create or replace function app.guard_schedule_version_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_ignored text[] := array['status', 'published_at', 'published_by', 'updated_at'];
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
    elsif not app.has_permission(new.school_id, 'schedule.update') then
      raise exception 'Droit requis pour modifier un emploi du temps : schedule.update.' using errcode = '42501';
    end if;
  end if;

  if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored)
     and not app.has_permission(new.school_id, 'schedule.update') then
    raise exception 'Droit requis pour modifier un emploi du temps : schedule.update.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_versions_guard on schedule_versions;
create trigger schedule_versions_guard
  before update on schedule_versions
  for each row execute function app.guard_schedule_version_update();

drop policy schedule_versions_update on schedule_versions;
create policy schedule_versions_update on schedule_versions for update to authenticated
using (
  app.can_write_year(school_id, academic_year_id, 'schedule.update')
  or app.can_write_year(school_id, academic_year_id, 'schedule.publish')
)
with check (
  app.can_write_year(school_id, academic_year_id, 'schedule.update')
  or app.can_write_year(school_id, academic_year_id, 'schedule.publish')
);

-- Publier remplace les séances datées : la suppression fait partie de l'étape.
drop policy occurrences_delete on session_occurrences;
create policy occurrences_delete on session_occurrences for delete to authenticated
using (
  app.can_write(school_id, 'schedule.delete')
  or app.can_write(school_id, 'schedule.publish')
);

-- -----------------------------------------------------------------------------
-- Registres d'appel
-- -----------------------------------------------------------------------------

create or replace function app.guard_attendance_register_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;
  -- Valider un registre (ou revenir sur une validation) : droit de validation.
  if (new.status is distinct from old.status and (new.status = 'VALIDATED' or old.status = 'VALIDATED'))
     or new.validated_by is distinct from old.validated_by
     or new.validated_at is distinct from old.validated_at then
    if not app.has_permission(new.school_id, 'attendance.validate') then
      raise exception 'Droit requis pour valider un appel : attendance.validate.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_registers_guard on attendance_registers;
create trigger attendance_registers_guard
  before update on attendance_registers
  for each row execute function app.guard_attendance_register_update();

-- -----------------------------------------------------------------------------
-- Annonces : rédiger n'est pas publier
-- -----------------------------------------------------------------------------
-- La règle d'insertion ne regardait que « Rédiger une annonce » : par un appel
-- direct, on pouvait créer une annonce déjà PUBLIÉE (visible de tous les membres)
-- sans détenir « Publier une annonce ».

drop policy announcements_insert on announcements;
create policy announcements_insert on announcements for insert to authenticated
with check (
  app.can_write(school_id, 'announcements.create')
  and (status = 'DRAFT' or app.can_write(school_id, 'announcements.publish'))
);

-- -----------------------------------------------------------------------------
-- Enseignants : les noms pour le travail, les coordonnées pour « Voir les enseignants »
-- -----------------------------------------------------------------------------
-- La fiche enseignant est lisible (0053) avec « Voir les enseignants », mais aussi
-- avec les affectations, les classes, tout l'emploi du temps ou toutes les
-- présences : ces écrans ont besoin du NOM du professeur. Toute la fiche suivait,
-- téléphone, e-mail, adresse, date de naissance et notes comprises : décocher
-- « Voir les enseignants » ne cachait pas les coordonnées.
--
-- Les colonnes personnelles ne sont plus lisibles directement ; elles passent
-- par teacher_contacts(), qui exige « Voir les enseignants » (ou sa propre fiche).
-- Écrire reste inchangé (règles d'insertion et de modification de 0011/0053).

revoke select on public.teachers from authenticated;
grant select (
  id, school_id, user_id, staff_number, first_name, last_name, gender, photo_url,
  hire_date, employment_type, specialty, status, weekly_minutes_min, weekly_minutes_max,
  diploma, diploma_detail, deleted_at, created_at, updated_at, created_by
) on public.teachers to authenticated;

create or replace function public.teacher_contacts(p_school uuid, p_ids uuid[] default null)
returns table (id uuid, birth_date date, phone_e164 text, email text, address text, notes text)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select t.id, t.birth_date, t.phone_e164, t.email, t.address, t.notes
  from public.teachers t
  where t.school_id = p_school
    and (p_ids is null or t.id = any(p_ids))
    and (
      app.can_read(p_school, 'teachers.view')
      or (t.user_id is not null and t.user_id = auth.uid())
    );
$$;

revoke all on function public.teacher_contacts(uuid, uuid[]) from public, anon;
grant execute on function public.teacher_contacts(uuid, uuid[]) to authenticated, service_role;
