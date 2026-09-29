-- =============================================================================
-- 0065 — Ordres d'enseignement : général, technique, professionnel
-- =============================================================================
--
-- L'établissement choisit ses ordres à l'inscription (schools.education_tracks).
-- Jusqu'ici, seul le général existait vraiment : les cycles, les niveaux et les
-- matières n'en portaient aucune trace, donc un établissement général se voyait
-- proposer des séries techniques, et un lycée professionnel ne trouvait pas ses
-- diplômes.
--
--   cycles.track      à quel ordre appartient le cycle (donc ses niveaux)
--   levels.diploma    diplôme du professionnel (CAP, BEP, BT, CQP, FQ), pour
--                     ranger « 1 BT COMPTA », « 2 CAP PLOMB »… par diplôme
--   subjects.tracks   ordres où la matière est enseignée (les maths sont dans
--                     les trois ; « Fabrication mécanique » seulement en technique)
--
-- Rien n'est renommé ni supprimé : tout l'existant reste du général.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'education_track') then
    create type education_track as enum ('GENERAL', 'TECHNIQUE', 'PROFESSIONNEL');
  end if;
end $$;

alter table cycles
  add column if not exists track education_track not null default 'GENERAL';

alter table levels
  add column if not exists diploma text;

alter table levels
  drop constraint if exists levels_diploma_len;
alter table levels
  add constraint levels_diploma_len check (diploma is null or char_length(btrim(diploma)) between 1 and 20);

alter table subjects
  add column if not exists tracks education_track[] not null default array['GENERAL']::education_track[];

alter table subjects
  drop constraint if exists subjects_tracks_not_empty;
alter table subjects
  -- `array_length` renvoie NULL sur un tableau vide, et un CHECK NULL passe :
  -- `cardinality` refuse bien la liste vide.
  add constraint subjects_tracks_not_empty check (cardinality(tracks) >= 1);

create index if not exists cycles_track_idx on cycles (school_id, track);
create index if not exists levels_diploma_idx on levels (school_id, diploma) where diploma is not null;

comment on column cycles.track is 'Ordre d''enseignement du cycle : ses niveaux en héritent.';
comment on column levels.diploma is 'Diplôme préparé (professionnel) : CAP, BEP, BT, CQP, FQ…';
comment on column subjects.tracks is 'Ordres d''enseignement où la matière existe.';
