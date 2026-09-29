-- =============================================================================
-- 0066 — Trimestres ET semestres dans la même année
-- =============================================================================
--
-- Le général fonctionne par TRIMESTRES ; l'enseignement technique et la
-- formation professionnelle fonctionnent par SEMESTRES, avec leur propre
-- calendrier. Un établissement qui fait les deux porte donc les deux découpages
-- dans la même année scolaire — ce que `unique (academic_year_id, sequence)`
-- interdisait : le 1er trimestre et le 1er semestre occupent tous deux le rang 1.
--
--   academic_periods.tracks   ordres concernés ; NULL = toute l'école (cas d'un
--                             établissement à un seul ordre, données existantes)
--
-- Le technique et le professionnel partagent les mêmes dates de semestres : une
-- LISTE d'ordres, et non un seul ordre, évite de saisir deux fois le même
-- découpage.
--
-- Règle de lecture (côté application) : pour une classe d'un ordre donné, on
-- prend les périodes qui visent CET ordre s'il en existe, sinon celles à NULL.
-- Un bulletin ne mélange donc jamais deux ordres : il suit la classe.

alter table academic_periods
  add column if not exists tracks education_track[];

-- Reprise d'une première version de cette migration, qui ne visait qu'un ordre.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'academic_periods' and column_name = 'track'
  ) then
    execute 'update academic_periods set tracks = array[track] where track is not null and tracks is null';
    execute 'alter table academic_periods drop column track';
  end if;
end $$;

alter table academic_periods
  drop constraint if exists academic_periods_academic_year_id_sequence_key;

alter table academic_periods
  drop constraint if exists academic_periods_tracks_not_empty;
alter table academic_periods
  add constraint academic_periods_tracks_not_empty check (tracks is null or cardinality(tracks) >= 1);

-- Un rang par ensemble d'ordres : T1 (général) et S1 (technique + professionnel)
-- cohabitent ; deux « rang 1 » pour les mêmes ordres restent impossibles.
drop index if exists academic_periods_year_sequence_all_key;
drop index if exists academic_periods_year_track_sequence_key;
create unique index academic_periods_year_sequence_all_key
  on academic_periods (academic_year_id, sequence) where tracks is null;
create unique index academic_periods_year_track_sequence_key
  on academic_periods (academic_year_id, tracks, sequence) where tracks is not null;

comment on column academic_periods.tracks is
  'Ordres d''enseignement concernés (semestres du technique et du professionnel, trimestres du général). NULL = tous les ordres.';
