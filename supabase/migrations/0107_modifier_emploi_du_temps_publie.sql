-- =============================================================================
-- 0107 — Changer un créneau dans l'emploi du temps PUBLIÉ
-- =============================================================================
--
-- Une école change un cours de place en cours d'année : M. Yao passe du lundi
-- 8h au mardi 10h. Refaire tout l'emploi du temps pour cela n'a pas de sens.
--
-- Le cours se modifie donc dans la version publiée, et ses séances datées
-- suivent, À PARTIR DE MAINTENANT :
--   - les séances à venir (pas encore commencées, sans appel) sont retirées ;
--   - elles sont recréées au nouvel horaire par la synchronisation habituelle ;
--   - le passé ne bouge pas : les séances déjà faites, et leurs appels, restent
--     à leur date et à leur heure d'origine.
-- =============================================================================

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

  if not app.can_write(v_school, 'schedule.publish') then
    raise exception 'Droit requis : publier l''emploi du temps.' using errcode = '42501';
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

  return (select count(*) from session_occurrences o
           where o.schedule_session_id = p_session and o.starts_at > now())::int;
end;
$$;

revoke all on function public.resync_session_occurrences(uuid) from public, anon;
grant execute on function public.resync_session_occurrences(uuid) to authenticated;

comment on function public.resync_session_occurrences(uuid) is
  'Apres un changement de creneau dans la version publiee : recree les seances a venir du cours, sans toucher au passe ni aux appels.';
