-- =============================================================================
-- 0084 — L'appel se fait PENDANT le cours, et nulle part ailleurs
--
-- app.can_take_attendance verifiait qui : l'enseignant de la seance, ou la vie
-- scolaire. Elle ne verifiait pas QUAND. Un enseignant pouvait donc faire
-- l'appel d'un cours de la semaine derniere, et l'application l'acceptait.
--
-- Trois raisons de fermer cette porte :
--
--   1. L'appel atteste aussi que l'ENSEIGNANT etait la. Rouvert apres coup, il
--      ne prouve plus rien.
--   2. Sans borne, deux cours qui se suivent peuvent se contredire : un
--      enseignant dont le cours finit a 8h00 marque un eleve absent a 8h05,
--      alors que l'enseignant suivant vient de le noter present a 8h00. Le
--      meme eleve devient absent et present a la meme heure.
--   3. Aucune marge, donc : ni avant, ni apres. Le creneau, rien que le creneau.
--
-- La vie scolaire (droit `attendance.create`) reste hors contrainte : c'est
-- elle qui regularise, et son geste est journalise. Un cours ANNULE n'accepte
-- evidemment aucun appel.
-- =============================================================================

create or replace function app.can_take_attendance(p_school uuid, p_occurrence uuid)
returns boolean
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school)
          and app.school_is_writable(p_school)
          and (
            -- La vie scolaire regularise a tout moment.
            app.has_permission(p_school, 'attendance.create')
            or exists (
              select 1
              from public.session_occurrences o
              join public.schedule_session_teachers st on st.session_id = o.schedule_session_id
              join public.teachers t on t.id = st.teacher_id
              where o.id = p_occurrence
                and t.user_id = auth.uid()
                and t.deleted_at is null
                and o.status <> 'CANCELLED'
                and now() >= coalesce(o.override_starts_at, o.starts_at)
                and now() <  coalesce(o.override_ends_at, o.ends_at)
            )
            or exists (
              select 1
              from public.session_occurrences o
              join public.teachers t on t.id = o.override_teacher_id
              where o.id = p_occurrence
                and t.user_id = auth.uid()
                and o.status <> 'CANCELLED'
                and now() >= coalesce(o.override_starts_at, o.starts_at)
                and now() <  coalesce(o.override_ends_at, o.ends_at)
            )
          ));
$$;

comment on function app.can_take_attendance(uuid, uuid) is
  'Faire l''appel : l''enseignant de la seance PENDANT le creneau (aucune marge), ou la vie scolaire a tout moment.';
