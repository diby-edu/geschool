-- =============================================================================
-- 0072 — Salles et types de salle par ordre d'enseignement
-- =============================================================================
--
-- Un type de salle n'a pas de sens dans tous les ordres. « Atelier mécanique »
-- ou « Cuisine pédagogique » n'existent que dans le technique et le
-- professionnel ; un lycée général n'a aucune raison de les voir proposés. À
-- l'inverse, « Salle de classe » vaut partout.
--
-- Et la salle elle-même doit le dire : un établissement qui a les trois ordres
-- peut réserver son atelier au professionnel, même si le type vaut pour deux
-- ordres. C'est ce qui permettra au générateur d'emploi du temps d'écarter une
-- salle qui ne sert pas à l'ordre de la classe.
--
-- Règle : la liste des ordres n'est JAMAIS vide. Vide voudrait dire « aucun
-- ordre », c'est-à-dire une salle inutilisable ; ce n'est jamais ce qu'on veut
-- dire, et ce serait indistinguable d'un oubli.
--
-- On supprime au passage `rooms.is_accessible` : la case « accessible aux
-- personnes handicapées » n'a jamais servi à rien dans l'application, et
-- l'établissement ne veut pas la renseigner.
-- ATTENTION : cette suppression n'est pas rétrocompatible avec le code encore
-- déployé qui lirait cette colonne. À appliquer avec la mise en production du
-- code correspondant.

-- -----------------------------------------------------------------------------
-- 1. Ordres d'enseignement du TYPE de salle
-- -----------------------------------------------------------------------------

alter table room_types
  add column if not exists tracks education_track[] not null
    default array['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']::education_track[];

comment on column room_types.tracks is
  'Ordres où ce type de salle a un sens. Un atelier mécanique ne concerne pas le général.';

alter table room_types drop constraint if exists room_types_tracks_not_empty;
alter table room_types
  add constraint room_types_tracks_not_empty check (cardinality(tracks) > 0);

-- -----------------------------------------------------------------------------
-- 2. Ordres d'enseignement de la SALLE
-- -----------------------------------------------------------------------------

alter table rooms
  add column if not exists tracks education_track[] not null
    default array['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']::education_track[];

comment on column rooms.tracks is
  'Ordres servis par cette salle. Repris du type à la création, puis restreignable.';

alter table rooms drop constraint if exists rooms_tracks_not_empty;
alter table rooms
  add constraint rooms_tracks_not_empty check (cardinality(tracks) > 0);

-- Les salles et les types déjà créés servaient forcément à tous les ordres de
-- leur établissement : aucune ne doit disparaître d'un écran du jour au
-- lendemain. Le défaut ci-dessus l'a déjà fait pour les lignes existantes ;
-- cette mise à jour rattrape une éventuelle ligne insérée avec une liste vide.
update room_types set tracks = array['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']::education_track[]
 where cardinality(tracks) = 0;
update rooms set tracks = array['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']::education_track[]
 where cardinality(tracks) = 0;

-- Recherche d'une salle par ordre : « les salles utilisables par une classe de
-- l'enseignement technique ». L'opérateur && (intersection) a besoin d'un GIN.
create index if not exists rooms_tracks_idx on rooms using gin (tracks);

-- -----------------------------------------------------------------------------
-- 3. La case « accessible » disparaît
-- -----------------------------------------------------------------------------

alter table rooms drop column if exists is_accessible;
