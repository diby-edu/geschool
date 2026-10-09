-- =============================================================================
-- 0104 — « Terminale » devient « Tle »
--
-- À l'école, on écrit « Tle D », pas « Terminale D ». La grille officielle
-- (official-ci.ts) crée désormais les niveaux sous ce nom ; cette migration
-- aligne ce qui existe déjà : niveaux et classes de toutes les écoles.
--
-- Seul le NOM change. Les codes (TLE-A1, TLE-D…) restent : ce sont eux qui
-- relient les niveaux à la grille officielle et aux imports. Un fichier
-- d'import qui écrit encore « Terminale C » se rattache toujours (la
-- comparaison souple de l'import tient les deux pour égaux).
--
-- Un mot entier seulement, en tête de nom : « Terminale D 2 » → « Tle D 2 ».
-- Rétrocompatible avec le code déjà en production : aucun traitement ne
-- dépend du nom d'un niveau ou d'une classe.
-- =============================================================================

update levels
set name = regexp_replace(name, '^Terminale\M', 'Tle')
where name ~ '^Terminale\M';

update classes
set name = regexp_replace(name, '^Terminale\M', 'Tle')
where name ~ '^Terminale\M';
