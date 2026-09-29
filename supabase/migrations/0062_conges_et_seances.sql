-- =============================================================================
-- 0062 — Congés et séances datées toujours d'accord
-- =============================================================================
--
-- PROBLEME  Les jours de congé (school_calendar_events.blocks_schedule) ne sont
--           exclus qu'au moment où l'emploi du temps est PUBLIÉ (séances datées,
--           0019). Un congé ajouté ensuite — calendrier officiel appliqué en cours
--           d'année, jour férié décidé tard — laissait les séances en place :
--           elles comptaient comme appels attendus, puis « non faits », au
--           tableau de bord comme au suivi du jour.
--
-- CORRECTIF La base garde les deux d'accord, quel que soit l'écran :
--   * congé ajouté ou élargi : les séances PRÉVUES de ces jours passent à
--     « annulée » (motif « Congé : <nom> »), sauf celles dont l'appel est déjà
--     fait (on n'efface jamais un appel) ;
--   * congé supprimé, raccourci ou qui ne bloque plus : les séances annulées PAR
--     CE congé redeviennent prévues, sauf si un autre congé couvre encore le jour.
-- Une annulation faite à la main (autre motif) n'est jamais rétablie.

create or replace function app.sync_occurrences_with_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.blocks_schedule then
    -- Séances annulées par CE congé : rattachées au congé qui couvre encore le
    -- jour s'il y en a un (pour qu'il puisse les rétablir à son tour), sinon
    -- rétablies.
    update session_occurrences o
       set status = case when c.cover is null then 'SCHEDULED'::occurrence_status else 'CANCELLED'::occurrence_status end,
           cancellation_reason = case when c.cover is null then null else 'Congé : ' || c.cover end,
           updated_at = now()
      from (
        select o2.id,
               (select e.name from school_calendar_events e
                 where e.academic_year_id = o2.academic_year_id
                   and e.blocks_schedule
                   and o2.occurs_on between e.starts_on and e.ends_on
                   and e.id <> old.id
                 order by e.starts_on, e.id
                 limit 1) as cover
          from session_occurrences o2
         where o2.school_id = old.school_id
           and o2.academic_year_id = old.academic_year_id
           and o2.occurs_on between old.starts_on and old.ends_on
           and o2.status = 'CANCELLED'
           and o2.cancellation_reason = 'Congé : ' || old.name
      ) c
     where o.id = c.id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.blocks_schedule then
    update session_occurrences o
       set status = 'CANCELLED', cancellation_reason = 'Congé : ' || new.name, updated_at = now()
     where o.school_id = new.school_id
       and o.academic_year_id = new.academic_year_id
       and o.occurs_on between new.starts_on and new.ends_on
       and o.status = 'SCHEDULED'
       and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);
  end if;

  return null;
end;
$$;

revoke all on function app.sync_occurrences_with_calendar() from public, anon, authenticated;

drop trigger if exists school_calendar_events_sync on school_calendar_events;
create trigger school_calendar_events_sync
  after insert or update or delete on school_calendar_events
  for each row execute function app.sync_occurrences_with_calendar();
