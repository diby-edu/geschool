-- =============================================================================
-- 0109 — Changer un créneau publié : les écrans ouverts se mettent à jour seuls
-- =============================================================================
-- Le temps réel diffuse schedule_versions, pas schedule_sessions. Après un
-- changement dans la version en service, on touche la version : chaque écran
-- ouvert (enseignant, élève, appel) recharge ses données sans action de
-- l'utilisateur.

create or replace function public.resync_session_occurrences(p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid;
  v_year   uuid;
  v_tz     text;
  v_today  date;
begin
  select ss.school_id, ss.academic_year_id, coalesce(nullif(s.timezone, ''), 'UTC')
    into v_school, v_year, v_tz
    from schedule_sessions ss
    join schools s on s.id = ss.school_id
   where ss.id = p_session;
  if not found then
    raise exception 'Séance introuvable.' using errcode = 'P0002';
  end if;

  if not (app.can_write(v_school, 'schedule.update')
          or app.can_write(v_school, 'schedule.create')
          or app.can_write(v_school, 'schedule.publish')) then
    raise exception 'Droit requis : modifier l''emploi du temps.' using errcode = '42501';
  end if;

  -- Séances à venir de ce cours : pas commencées, et sans appel.
  delete from session_occurrences o
   where o.schedule_session_id = p_session
     and coalesce(o.override_starts_at, o.starts_at) > now()
     and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);

  v_today := (now() at time zone v_tz)::date;
  perform app.sync_year_occurrences(v_year, v_today, null);

  -- Placé aujourd'hui à une heure déjà passée : cette séance-là n'a pas eu
  -- lieu ; la recréer la ferait compter comme un appel manquant.
  delete from session_occurrences o
   where o.schedule_session_id = p_session
     and o.occurs_on = v_today
     and o.generated_at = now()
     and o.starts_at <= now()
     and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);

  -- Signal « en direct » : les écrans ouverts (tableau de bord enseignant,
  -- emploi du temps, appel) écoutent schedule_versions et se rafraîchissent.
  update schedule_versions v
     set updated_at = now()
   where v.id = (select ss.schedule_version_id from schedule_sessions ss where ss.id = p_session);

  return (select count(*) from session_occurrences o
           where o.schedule_session_id = p_session and o.starts_at > now())::int;
end;
$$;
