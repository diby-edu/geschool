-- =============================================================================
-- 0039 — Grille horaire par cycle (recreations differentes par cycle)
-- =============================================================================
--
-- Un etablissement peut avoir des recreations differentes en primaire et au
-- secondaire. schedule_configurations autorisait deja PLUSIEURS lignes par
-- annee (l'unicite ne portait que sur is_default) : on ajoute simplement une
-- portee cycle optionnelle. cycle_id NULL = grille par defaut (tout
-- l'etablissement, comportement inchange pour qui n'utilise pas cette
-- fonctionnalite) ; cycle_id renseigne = grille propre a ce cycle.

alter table schedule_configurations
  add column cycle_id uuid references cycles(id) on delete cascade;

create index schedule_configurations_cycle_idx
  on schedule_configurations (school_id, academic_year_id, cycle_id);

-- Remplace l'ancienne contrainte (une seule ligne par_defaut par annee) par
-- deux contraintes complementaires : une seule grille par_defaut SANS cycle
-- (le socle), et une seule grille par_defaut PAR cycle (les exceptions).
drop index if exists schedule_configurations_default_key;

create unique index schedule_configurations_default_key
  on schedule_configurations (school_id, academic_year_id)
  where is_default and cycle_id is null;

create unique index schedule_configurations_default_cycle_key
  on schedule_configurations (school_id, academic_year_id, cycle_id)
  where is_default and cycle_id is not null;
